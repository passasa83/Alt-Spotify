import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../Layout';

vi.mock('@/components/Sidebar', () => ({
  default: () => <aside data-testid="sidebar">Sidebar</aside>,
}));
vi.mock('@/components/TopBar', () => ({
  default: () => <header data-testid="topbar">TopBar</header>,
}));
vi.mock('@/components/Player', () => ({
  default: () => <footer data-testid="player">Player</footer>,
}));
vi.mock('@/stores/playerStore', () => ({
  usePlayerStore: () => ({
    showLyrics: false,
    lyrics: [],
  }),
}));

describe('Layout', () => {
  it('renders sidebar', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders topbar', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
  });

  it('renders children via Outlet', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });
});
