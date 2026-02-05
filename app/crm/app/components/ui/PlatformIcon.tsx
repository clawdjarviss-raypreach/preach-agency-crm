'use client';

import { Globe, Video, Heart } from 'lucide-react';

type Platform = 'onlyfans' | 'fansly' | 'other';

interface PlatformIconProps {
  platform: Platform;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const platformConfig: Record<Platform, {
  icon: React.ReactNode;
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}> = {
  onlyfans: {
    icon: <Heart className="w-full h-full" />,
    label: 'OnlyFans',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  fansly: {
    icon: <Video className="w-full h-full" />,
    label: 'Fansly',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    textColor: 'text-purple-600 dark:text-purple-400',
    borderColor: 'border-purple-200 dark:border-purple-800',
  },
  other: {
    icon: <Globe className="w-full h-full" />,
    label: 'Other',
    bgColor: 'bg-zinc-100 dark:bg-zinc-800',
    textColor: 'text-zinc-600 dark:text-zinc-400',
    borderColor: 'border-zinc-200 dark:border-zinc-700',
  },
};

const sizeConfig = {
  sm: { container: 'w-6 h-6', icon: 'w-3.5 h-3.5', text: 'text-xs' },
  md: { container: 'w-8 h-8', icon: 'w-4 h-4', text: 'text-sm' },
  lg: { container: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-base' },
};

export function PlatformIcon({ platform, size = 'md', showLabel = false }: PlatformIconProps) {
  const config = platformConfig[platform];
  const sizeClasses = sizeConfig[size];

  if (showLabel) {
    return (
      <div className="flex items-center gap-2">
        <div 
          className={`
            ${sizeClasses.container} 
            ${config.bgColor} 
            ${config.textColor}
            ${config.borderColor}
            border
            rounded-lg 
            flex items-center justify-center
            flex-shrink-0
          `}
        >
          <div className={sizeClasses.icon}>
            {config.icon}
          </div>
        </div>
        <span className={`${sizeClasses.text} font-medium ${config.textColor}`}>
          {config.label}
        </span>
      </div>
    );
  }

  return (
    <div 
      className={`
        ${sizeClasses.container} 
        ${config.bgColor} 
        ${config.textColor}
        ${config.borderColor}
        border
        rounded-lg 
        flex items-center justify-center
      `}
      title={config.label}
    >
      <div className={sizeClasses.icon}>
        {config.icon}
      </div>
    </div>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  const config = platformConfig[platform];
  
  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 
        rounded-full px-2.5 py-1 
        text-xs font-medium
        ${config.bgColor} 
        ${config.textColor}
        border ${config.borderColor}
      `}
    >
      <span className="w-3 h-3">
        {config.icon}
      </span>
      {config.label}
    </span>
  );
}

export { platformConfig };
export type { Platform };
