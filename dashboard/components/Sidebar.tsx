'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CalendarDays, Clapperboard, Send, Users,
  MessageSquare, Mail, BarChart3, Settings,
} from 'lucide-react';
import { Logo } from './Logo';
import { isSupabaseConfigured } from '@/lib/supabase';

const NAV = [
  { href: '/', label: 'Overview', Icon: LayoutDashboard },
  { href: '/calendar', label: 'Content Calendar', Icon: CalendarDays },
  { href: '/videos', label: 'Videos', Icon: Clapperboard },
  { href: '/posts', label: 'Posts', Icon: Send },
  { href: '/leads', label: 'Leads & CRM', Icon: Users },
  { href: '/comments', label: 'Comments', Icon: MessageSquare },
  { href: '/emails', label: 'Email List', Icon: Mail },
  { href: '/analytics', label: 'Analytics', Icon: BarChart3 },
  { href: '/settings', label: 'Pipeline Settings', Icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-surface">
      <div className="px-5 py-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-navy-light/40 text-white shadow-[inset_2px_0_0_0_#d4af37]'
                  : 'text-white/55 hover:bg-surface-2 hover:text-white'
              }`}
            >
              <Icon size={17} className={active ? 'text-gold' : ''} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`}
          />
          <span className="text-white/45">
            {isSupabaseConfigured ? 'Live · Supabase connected' : 'Demo · placeholder data'}
          </span>
        </div>
      </div>
    </aside>
  );
}
