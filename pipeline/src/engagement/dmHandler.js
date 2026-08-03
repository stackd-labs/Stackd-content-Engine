// ============================================================
// Stage 10 — DM Handler
// startDmSequence  — called by commentMonitor when a trigger
//                    word is detected; inserts a new lead and
//                    sends the opening DM message.
// handleDmReply    — called when an inbound DM reply arrives;
//                    advances the conversation, qualifies the
//                    lead, and captures calendar / email.
// ============================================================
import { generateText, generateJSON } from '../lib/ai.js';
import { dbInsert, dbUpdate, dbSelect } from '../lib/supabase.js';
import { getSettings } from '../lib/settings.js';
import { env, has } from '../lib/env.js';
import { fetchJSON } from '../lib/http.js';
import { getPlatformCredential } from '../lib/credentials.js';
import { signOAuth1 } from '../platforms/uploadToTwitter.js';
import { log } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Humanise a handle into a display name: "@chanel.gray" → "chanel gray" */
function handleToName(handle) {
  if (!handle) return 'there';
  return handle.replace(/[@._-]/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// sendDM — the actual delivery step. Every drafted message that gets
// pushed into a lead's conversation_log is sent here first, so what the
// dashboard shows as "sent" really went out.
//
// twitter:              resolve @handle -> user id, then the DM API — works
//                        for any handle at any point in the conversation.
// instagram / facebook: Meta's Private Replies API turns a specific PUBLIC
//                        COMMENT into a DM. That only works for the opening
//                        message (we have the triggering comment's id);
//                        there is no PSID to message an arbitrary handle
//                        directly, so follow-ups on these platforms are
//                        logged, not delivered.
// tiktok / linkedin / youtube: no send-message API available to this app
//                        with the credentials this project supports.
// ---------------------------------------------------------------------------
async function sendTwitterDM(handle, message, cred) {
  const sign = (method, url) => signOAuth1(method, url, {}, { token: cred.accessToken, tokenSecret: cred.tokenSecret });

  const username = handle.replace(/^@/, '');
  const lookupUrl = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}`;
  const user = await fetchJSON(lookupUrl, { headers: { Authorization: sign('GET', lookupUrl) } });
  const participantId = user?.data?.id;
  if (!participantId) throw new Error(`could not resolve Twitter user id for ${handle}`);

  const dmUrl = `https://api.twitter.com/2/dm_conversations/with/${participantId}/messages`;
  await fetchJSON(dmUrl, {
    method: 'POST',
    headers: { Authorization: sign('POST', dmUrl), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
}

async function sendMetaPrivateReply(platform, platformCommentId, message) {
  const token = platform === 'instagram' ? env.INSTAGRAM_ACCESS_TOKEN : env.FACEBOOK_PAGE_ACCESS_TOKEN;
  await fetchJSON(`https://graph.facebook.com/v19.0/${encodeURIComponent(platformCommentId)}/private_replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: token }).toString(),
  });
}

/**
 * @param {{ platform: string, handle: string, message: string, platformCommentId?: string|null }} opts
 * @returns {Promise<{ delivered: boolean, reason?: string }>}
 */
export async function sendDM({ platform, handle, message, platformCommentId = null }) {
  try {
    if (platform === 'twitter') {
      const cred = await getPlatformCredential('twitter');
      if (cred?.accessToken && cred?.tokenSecret) {
        await sendTwitterDM(handle, message, cred);
        log.ok(`dmHandler: DM delivered to ${handle} via twitter`);
        return { delivered: true };
      }
    }

    if (
      (platform === 'instagram' && has('INSTAGRAM_ACCESS_TOKEN')) ||
      (platform === 'facebook' && has('FACEBOOK_PAGE_ACCESS_TOKEN'))
    ) {
      if (!platformCommentId) {
        log.warn(
          `dmHandler: no source comment id for ${handle} on ${platform} — private-reply DMs require ` +
          `the triggering comment, so this follow-up can't be delivered live`,
        );
        return { delivered: false, reason: 'no platformCommentId' };
      }
      await sendMetaPrivateReply(platform, platformCommentId, message);
      log.ok(`dmHandler: DM delivered to ${handle} via ${platform} private reply`);
      return { delivered: true };
    }

    log.mock(`DM send to ${handle} via ${platform}`);
    return { delivered: false, reason: 'no send API configured for this platform' };
  } catch (err) {
    log.error(`dmHandler.sendDM failed for ${handle} on ${platform}: ${err.message}`);
    return { delivered: false, reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// startDmSequence
// ---------------------------------------------------------------------------
/**
 * @param {object} params
 * @param {string} params.platform
 * @param {string} params.handle         — e.g. "@taylorbuilds"
 * @param {string} params.triggerWord    — the matched keyword
 * @param {string|null} params.sourceVideoId
 * @param {string|null} params.sourcePostId
 * @param {string} params.commentText
 * @param {string|null} params.platformCommentId — needed for instagram/facebook private-reply delivery
 * @returns {Promise<object|null>}       — inserted lead record
 */
export async function startDmSequence({
  platform,
  handle,
  triggerWord,
  sourceVideoId = null,
  sourcePostId = null,
  commentText = '',
  platformCommentId = null,
}) {
  try {
    log.stage('dmHandler', `startDmSequence → ${handle} (${platform}) trigger="${triggerWord}"`);

    const settings = getSettings();
    const lmName = settings.leadMagnet?.name || 'the free AI Automation Blueprint';
    const lmUrl = settings.leadMagnet?.url || 'https://stackdstudiosai.com/free/toolkit';
    const persona = settings.brand?.voicePersona || 'Chanel Gray, founder of Stackd Studios';

    const mockDM =
      `Hey ${handleToName(handle)}! I noticed you mentioned "${triggerWord}" — that's literally what we do at Stackd Studios. ` +
      `I'd love to send you ${lmName} (free): ${lmUrl} 🎁\n\n` +
      `Quick question — what's the #1 thing you're trying to automate or build right now?`;

    const initialDM = await generateText({
      system:
        `You are ${persona}. Write a warm, direct, short opening DM (2-3 sentences max + 1 question) ` +
        `to a new lead who commented on your content. Offer the free lead magnet, be genuine, no fluff.`,
      prompt:
        `Lead handle: ${handle}\n` +
        `Platform: ${platform}\n` +
        `Their comment: "${commentText}"\n` +
        `Trigger word matched: "${triggerWord}"\n` +
        `Lead magnet: ${lmName} — ${lmUrl}\n\n` +
        `Write the opening DM message.`,
      maxTokens: 300,
      mock: mockDM,
    });

    const sendResult = await sendDM({ platform, handle, message: initialDM, platformCommentId });

    const now = new Date().toISOString();
    const conversation_log = [{ role: 'agent', text: initialDM, at: now }];

    const lead = await dbInsert('leads', {
      source_platform: platform,
      source_post_id: sourcePostId,
      source_video_id: sourceVideoId,
      name: handleToName(handle),
      handle,
      email: null,
      trigger_word: triggerWord,
      conversation_log,
      status: 'contacted',
      notes: `Triggered by "${triggerWord}" on ${platform}`,
      created_at: now,
    });

    log.ok(`dmHandler: lead created id=${lead?.id ?? 'n/a'} handle=${handle} delivered=${sendResult.delivered}`);
    return lead;
  } catch (err) {
    log.error(`dmHandler.startDmSequence failed for ${handle}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// handleDmReply
// ---------------------------------------------------------------------------
/**
 * @param {object} params
 * @param {string} params.leadId   — uuid of the leads row
 * @param {string} params.message  — the inbound DM text from the lead
 * @returns {Promise<object>}      — { lead, reply, qualified, email }
 */
export async function handleDmReply({ leadId, message }) {
  try {
    log.stage('dmHandler', `handleDmReply leadId=${leadId}`);

    const settings = getSettings();
    const calLink = settings.calendarLink || 'https://cal.com/stackdstudios/intro';
    const persona = settings.brand?.voicePersona || 'Chanel Gray, founder of Stackd Studios';

    // --- 1. Load lead -------------------------------------------------------
    const rows = await dbSelect('leads', { match: { id: leadId } });
    if (!rows || rows.length === 0) {
      log.warn(`dmHandler.handleDmReply: lead ${leadId} not found`);
      return { lead: null, reply: null, qualified: false, email: null };
    }
    const lead = rows[0];

    // --- 2. Append inbound message to conversation log ----------------------
    const now = new Date().toISOString();
    const conversationLog = Array.isArray(lead.conversation_log) ? [...lead.conversation_log] : [];
    conversationLog.push({ role: 'lead', text: message, at: now });

    const messageCount = conversationLog.filter((e) => e.role === 'lead').length;

    // --- 3. Claude decides next step ----------------------------------------
    const convoText = conversationLog
      .map((e) => `${e.role === 'agent' ? 'You' : 'Lead'}: ${e.text}`)
      .join('\n');

    const mockReply =
      messageCount >= 3
        ? {
            reply:
              `This sounds like a great fit! I'd love to hop on a quick call — grab a time that works for you: ${calLink} 📅`,
            qualified: true,
            email: null,
          }
        : {
            reply:
              `Love that! To make sure I point you in the right direction — what's your current monthly revenue or stage? ` +
              `(pre-revenue, $1-10k/mo, or $10k+?)`,
            qualified: false,
            email: null,
          };

    const result = await generateJSON({
      system:
        `You are ${persona} managing a DM conversation with a warm lead. ` +
        `Your goal: qualify them in 2-3 conversational messages max, then offer a calendar booking. ` +
        `Extract their email address if they mention one. ` +
        `If the lead seems ready or you've asked 2+ questions, mark qualified=true and include the calendar link in the reply.`,
      prompt:
        `Calendar link: ${calLink}\n` +
        `Messages from lead so far: ${messageCount}\n\n` +
        `Full conversation:\n${convoText}\n\n` +
        `Latest lead message: "${message}"\n\n` +
        `Return JSON: { "reply": "your next DM message", "qualified": true|false, "email": "address or null" }`,
      maxTokens: 500,
      mock: mockReply,
    });

    const { reply, qualified, email } = result;

    // --- 4. Send + build updated state ---------------------------------------
    const replySend = await sendDM({ platform: lead.source_platform, handle: lead.handle, message: reply });
    conversationLog.push({ role: 'agent', text: reply, at: new Date().toISOString() });

    let status = lead.status;
    if (qualified) {
      status = 'qualified';
      // Append calendar link as a clear message if not already in reply
      if (!reply.includes(calLink)) {
        const calMessage = `Book your free strategy call here: ${calLink}`;
        await sendDM({ platform: lead.source_platform, handle: lead.handle, message: calMessage });
        conversationLog.push({
          role: 'agent',
          text: calMessage,
          at: new Date().toISOString(),
        });
      }
    }

    // --- 5. Persist ---------------------------------------------------------
    const patch = {
      conversation_log: conversationLog,
      status,
      ...(email ? { email } : {}),
    };

    const updatedLead = await dbUpdate('leads', leadId, patch);

    log.ok(
      `dmHandler: reply sent lead=${leadId} delivered=${replySend.delivered} qualified=${qualified} status=${status}${email ? ` email=${email}` : ''}`,
    );

    return { lead: updatedLead, reply, qualified, email: email ?? null };
  } catch (err) {
    log.error(`dmHandler.handleDmReply failed for lead ${leadId}: ${err.message}`);
    return { lead: null, reply: null, qualified: false, email: null };
  }
}

export default startDmSequence;
