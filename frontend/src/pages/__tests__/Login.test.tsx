import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/stores/authStore');

const mockUseAuthStore = vi.mocked(useAuthStore);

beforeEach(() => {
  mockUseAuthStore.mockReturnValue({
    login: vi.fn(),
    isLoading: false,
  } as any);
});

describe('Login', () => {
  it('renders login form', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    expect(screen.getByText('Log in to continue')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('shows validation error on empty submit', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);

    expect(screen.getByPlaceholderText('Enter your email')).toBeInvalid();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInvalid();
  });

  it('submit calls login', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockUseAuthStore.mockReturnValue({ login, isLoading: false } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(login).toHaveBeenCalledWith('test@test.com', 'password123');
  });

  it('shows error message on login failure', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Invalid'));
    mockUseAuthStore.mockReturnValue({ login, isLoading: false } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email'), 'bad@test.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });
});
