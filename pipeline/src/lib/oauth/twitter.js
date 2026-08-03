// ============================================================
// Twitter / X OAuth 1.0a — 3-legged flow.
// Requires TWITTER_API_KEY / TWITTER_API_SECRET (app-level "consumer"
// credentials, stay in .env). Unlike OAuth2, OAuth1 has no refresh —
// user access tokens don't expire.
//
// Sequence:
//   1. getRequestToken   — signed call BEFORE any redirect (OAuth1's
//      request_token step needs the consumer secret, unlike OAuth2's
//      authorize step which needs only the public client id).
//   2. browser -> authorizeUrl -> user approves -> redirected back with
//      oauth_token + oauth_verifier.
//   3. exchangeVerifier  — signed call using the temporary token/secret
//      from step 1 plus the verifier, returns the final long-lived pair.
// ============================================================
import { fetchJSON } from '../http.js';
import { env } from '../env.js';
import { signOAuth1 } from '../../platforms/uploadToTwitter.js';

const REQUEST_TOKEN_URL = 'https://api.twitter.com/oauth/request_token';
const AUTHORIZE_URL = 'https://api.twitter.com/oauth/authorize';
const ACCESS_TOKEN_URL = 'https://api.twitter.com/oauth/access_token';

/** Twitter's OAuth1 endpoints return form-urlencoded bodies, not JSON. */
function parseFormBody(res) {
  const raw = res?.raw ?? '';
  return Object.fromEntries(new URLSearchParams(raw));
}

/** Step 1: obtain a temporary request token, signed with the consumer key/secret only. */
export async function getRequestToken(callbackUrl) {
  const params = { oauth_callback: callbackUrl };
  const res = await fetchJSON(REQUEST_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: signOAuth1('POST', REQUEST_TOKEN_URL, params, {
        consumerKey: env.TWITTER_API_KEY,
        consumerSecret: env.TWITTER_API_SECRET,
      }),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  const body = parseFormBody(res);
  if (body.oauth_callback_confirmed !== 'true' || !body.oauth_token) {
    throw new Error('Twitter request_token did not confirm the callback — check TWITTER_API_KEY/SECRET');
  }

  return {
    oauthToken: body.oauth_token,
    oauthTokenSecret: body.oauth_token_secret,
    authorizeUrl: `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(body.oauth_token)}`,
  };
}

/** Step 3: exchange the verifier for the final long-lived access token/secret. */
export async function exchangeVerifier(oauthToken, oauthTokenSecret, oauthVerifier) {
  const params = { oauth_verifier: oauthVerifier };
  const res = await fetchJSON(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: signOAuth1('POST', ACCESS_TOKEN_URL, params, {
        consumerKey: env.TWITTER_API_KEY,
        consumerSecret: env.TWITTER_API_SECRET,
        token: oauthToken,
        tokenSecret: oauthTokenSecret,
      }),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  const body = parseFormBody(res);
  if (!body.oauth_token || !body.oauth_token_secret) {
    throw new Error('Twitter access_token exchange did not return a token pair');
  }

  return {
    accessToken: body.oauth_token,
    accessTokenSecret: body.oauth_token_secret,
    screenName: body.screen_name ?? null,
  };
}
