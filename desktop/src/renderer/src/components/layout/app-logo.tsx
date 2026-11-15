import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
}

export function AppLogo({ className }: AppLogoProps) {
  return <Building2 className={cn('shrink-0 text-accent', className)} />;
}
