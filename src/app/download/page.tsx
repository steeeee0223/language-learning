import type { Metadata } from 'next';

import { getDownloadOptions } from '@/lib/download-options';

import { DownloadClient } from './download-client';

export const metadata: Metadata = {
  title: 'Download Language Learning Notes',
  description: 'Download the Language Learning Notes desktop app.',
};

export default function DownloadPage() {
  return <DownloadClient options={getDownloadOptions()} />;
}
