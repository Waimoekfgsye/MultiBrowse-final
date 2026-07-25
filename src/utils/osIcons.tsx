import { Monitor, Apple, Terminal, Smartphone } from 'lucide-react';

export function getOSIconComponent(os: string, size: number = 16) {
  const style = { width: size, height: size };
  switch (os) {
    case 'Windows':
      return <Monitor style={style} />;
    case 'macOS':
      return <Apple style={style} />;
    case 'Linux':
      return <Terminal style={style} />;
    case 'Android':
    case 'iOS':
      return <Smartphone style={style} />;
    default:
      return <Monitor style={style} />;
  }
}

export function getBrowserIconComponent(browserVersion: string, size: number = 14) {
  const name = browserVersion.split(' ')[0];
  return <span style={{ fontSize: size }}>{name?.slice(0, 2) || 'Br'}</span>;
}

export function getOSLabel(os: string): string {
  switch (os) {
    case 'Windows': return 'Windows';
    case 'macOS': return 'macOS';
    case 'Linux': return 'Linux';
    case 'Android': return 'Android';
    case 'iOS': return 'iOS';
    default: return os;
  }
}

export function getOSDescription(os: string): string {
  switch (os) {
    case 'Windows': return 'Most common desktop OS';
    case 'macOS': return 'Apple ecosystem';
    case 'Linux': return 'Developer-focused';
    case 'Android': return 'Mobile — Google ecosystem';
    case 'iOS': return 'Mobile — Apple ecosystem';
    default: return '';
  }
}
