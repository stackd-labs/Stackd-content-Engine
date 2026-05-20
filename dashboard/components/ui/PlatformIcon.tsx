import { Youtube, Instagram, Linkedin, Facebook, Twitter, Music2 } from 'lucide-react';
import type { Platform } from '@shared/types';

const MAP: Record<Platform, { Icon: any; color: string; label: string }> = {
  youtube: { Icon: Youtube, color: '#ff0033', label: 'YouTube' },
  tiktok: { Icon: Music2, color: '#ffffff', label: 'TikTok' },
  instagram: { Icon: Instagram, color: '#e1306c', label: 'Instagram' },
  linkedin: { Icon: Linkedin, color: '#0a66c2', label: 'LinkedIn' },
  facebook: { Icon: Facebook, color: '#1877f2', label: 'Facebook' },
  twitter: { Icon: Twitter, color: '#1d9bf0', label: 'X' },
};

export function PlatformIcon({
  platform,
  size = 16,
  withLabel = false,
}: {
  platform: Platform | string | null;
  size?: number;
  withLabel?: boolean;
}) {
  const cfg = MAP[platform as Platform];
  if (!cfg) return <span className="text-white/40">—</span>;
  const { Icon, color, label } = cfg;
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <Icon size={size} style={{ color }} />
      {withLabel && <span className="text-sm text-white/80">{label}</span>}
    </span>
  );
}

export function PlatformIcons({ platforms }: { platforms: (Platform | string)[] }) {
  const unique = Array.from(new Set(platforms));
  return (
    <span className="inline-flex items-center gap-1.5">
      {unique.map((p) => (
        <PlatformIcon key={p} platform={p} size={15} />
      ))}
      {unique.length === 0 && <span className="text-white/30">—</span>}
    </span>
  );
}
