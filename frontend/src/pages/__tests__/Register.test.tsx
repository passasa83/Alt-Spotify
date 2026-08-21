import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from '../Register';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/stores/authStore');

const mockUseAuthStore = vi.mocked(useAuthStore);

beforeEach(() => {
  mockUseAuthStore.mockReturnValue({
    register: vi.fn(),
    isLoading: false,
  } as any);
});

describe('Register', () => {
  it('renders register form', () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );
    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Choose a display name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Create a password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  it('shows link to login', () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
    expect(screen.getByText('Log in')).toHaveAttribute('href', '/login');
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Choose a display name'), 'testuser');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'different');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
  });

  it('shows error when password is too short', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Choose a display name'), 'testuser');
    await user.type(screen.getByPlaceholderText('Create a password'), '123');
    await user.type(screen.getByPlaceholderText('Confirm your password'), '123');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument();
  });

  it('calls register with correct arguments', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    mockUseAuthStore.mockReturnValue({ register, isLoading: false } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email'), 'new@test.com');
    await user.type(screen.getByPlaceholderText('Choose a display name'), 'newuser');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(register).toHaveBeenCalledWith('new@test.com', 'newuser', 'password123');
  });

  it('shows error message on registration failure', async () => {
    const register = vi.fn().mockRejectedValue({
      response: { data: { detail: 'Email already registered' } },
    });
    mockUseAuthStore.mockReturnValue({ register, isLoading: false } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email'), 'dup@test.com');
    await user.type(screen.getByPlaceholderText('Choose a display name'), 'dupuser');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
  });

  it('shows generic error when no detail provided', async () => {
    const register = vi.fn().mockRejectedValue(new Error('Network error'));
    mockUseAuthStore.mockReturnValue({ register, isLoading: false } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email'), 'fail@test.com');
    await user.type(screen.getByPlaceholderText('Choose a display name'), 'failuser');
    await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText('Registration failed. Email may already be in use.')).toBeInTheDocument();
  });

  it('disables button while loading', () => {
    mockUseAuthStore.mockReturnValue({
      register: vi.fn(),
      isLoading: true,
    } as any);

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
  });
});
