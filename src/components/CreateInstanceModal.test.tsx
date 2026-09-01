import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CreateInstanceModal } from './CreateInstanceModal';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('CreateInstanceModal', () => {
  it('renders the modal when isOpen is true', async () => {
    render(<CreateInstanceModal isOpen={true} onClose={() => {}} onCreated={() => {}} />);

    expect(await screen.findByText('Create New Pack')).toBeInTheDocument();

    const modrinthBtn = await screen.findByText('Modrinth');
    expect(modrinthBtn).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CreateInstanceModal isOpen={false} onClose={() => {}} onCreated={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('allows typing an instance name', async () => {
    render(<CreateInstanceModal isOpen={true} onClose={() => {}} onCreated={() => {}} />);

    const input = (await screen.findByPlaceholderText(
      'Autofills from base pack...'
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Test Modpack' } });

    expect(input.value).toBe('Test Modpack');
  });
});
