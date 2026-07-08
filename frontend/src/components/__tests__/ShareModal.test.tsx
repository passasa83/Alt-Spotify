import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShareModal from '../ShareModal';

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe('ShareModal', () => {
  it('renders nothing when not open', () => {
    render(<ShareModal isOpen={false} onClose={vi.fn()} shareLink={{ url: 'https://example.com' }} />);
    expect(screen.queryByText('Share')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    render(<ShareModal isOpen={true} onClose={vi.fn()} shareLink={{ url: 'https://example.com' }} />);
    expect(screen.getByText('Share')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
  });

  it('copy button works', async () => {
    render(<ShareModal isOpen={true} onClose={vi.fn()} shareLink={{ url: 'https://example.com' }} />);
    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<ShareModal isOpen={true} onClose={onClose} shareLink={{ url: 'https://example.com' }} />);
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find(btn => btn.querySelector('.lucide-x'));
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalled();
  });
});
