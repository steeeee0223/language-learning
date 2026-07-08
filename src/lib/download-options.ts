export type DownloadOption = {
  id: string;
  label: string;
  meta: string;
  platform: 'mac' | 'windows';
  href: string | null;
  enabled: boolean;
};

export function getDownloadOptions(
  env: Record<string, string | undefined> = process.env,
): DownloadOption[] {
  const macUniversalUrl = env.DOWNLOAD_MAC_UNIVERSAL_URL || null;

  return [
    {
      id: 'mac-universal',
      label: 'macOS Universal',
      meta: '.dmg',
      platform: 'mac',
      href: macUniversalUrl,
      enabled: macUniversalUrl !== null,
    },
    {
      id: 'mac-apple-silicon',
      label: 'macOS Apple Silicon',
      meta: 'Coming soon',
      platform: 'mac',
      href: null,
      enabled: false,
    },
    {
      id: 'mac-intel',
      label: 'macOS Intel x64',
      meta: 'Coming soon',
      platform: 'mac',
      href: null,
      enabled: false,
    },
    {
      id: 'windows-exe-x64',
      label: 'Windows .exe x64',
      meta: 'Coming soon',
      platform: 'windows',
      href: null,
      enabled: false,
    },
    {
      id: 'windows-exe-arm64',
      label: 'Windows .exe ARM64',
      meta: 'Coming soon',
      platform: 'windows',
      href: null,
      enabled: false,
    },
  ];
}
