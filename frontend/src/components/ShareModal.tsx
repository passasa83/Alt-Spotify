import { useState, useRef, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { ShareLink } from '@/types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareLink: ShareLink | null;
  title?: string;
}

const ShareModal = ({ isOpen, onClose, shareLink, title }: ShareModalProps) => {
  const [copied, setCopied] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleClose = () => {
    previousFocusRef.current?.focus();
    onClose();
  };

  if (!isOpen || !shareLink) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = shareLink.url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const qrText = `QR:${shareLink.url}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        tabIndex={-1}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="share-modal-title" className="text-lg font-semibold text-white">{title || 'Share'}</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-gray-900 p-4">
          <p className="mb-2 text-xs text-gray-400">Share Link</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareLink.url}
              aria-label="Share link URL"
              className="flex-1 rounded bg-gray-800 px-3 py-2 text-sm text-white outline-none"
            />
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded bg-green-500 px-3 py-2 text-sm font-medium text-black hover:bg-green-400 focus-visible:outline-2 focus-visible:outline-green-500"
              aria-label={copied ? 'Copied to clipboard' : 'Copy link'}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {shareLink.expires_at && (
            <p className="mt-2 text-xs text-gray-500">
              Expires: {new Date(shareLink.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="mb-4 rounded-lg bg-gray-900 p-4 text-center">
          <p className="mb-2 text-xs text-gray-400">QR Code</p>
          <div className="mx-auto flex h-32 w-32 items-center justify-center rounded bg-white p-2">
            <pre className="text-[6px] leading-tight text-black">{qrText}</pre>
          </div>
        </div>

        <div className="flex gap-2">
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareLink.url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg bg-blue-500 py-2 text-center text-sm font-medium text-white hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            Twitter
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink.url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg bg-blue-700 py-2 text-center text-sm font-medium text-white hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            Facebook
          </a>
          <a
            href={`mailto:?subject=Check this out&body=${encodeURIComponent(shareLink.url)}`}
            className="flex-1 rounded-lg bg-gray-700 py-2 text-center text-sm font-medium text-white hover:bg-gray-600 focus-visible:outline-2 focus-visible:outline-green-500"
          >
            Email
          </a>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
