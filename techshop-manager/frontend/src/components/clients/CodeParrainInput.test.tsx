import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CodeParrainInput } from './CodeParrainInput';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

const alice = { id: 'alice', codeParrain: 'EBN-A', nom: 'Alice', telephone: '+243900000001' };
const bruno = { id: 'bruno', codeParrain: 'EBN-B', nom: 'Bruno', telephone: '+243900000002' };
const placeholder = 'Matricule, téléphone ou nom du parrain…';

beforeEach(() => { get.mockReset(); });

describe('Recruiter selection synchronization', () => {
  it('restricts assignment search to active or pending recruiters when requested', async () => {
    get.mockResolvedValue({ data: { results: [
      { ...alice, statut: 'ACTIF' }, { ...bruno, statut: 'EN_COURS' },
      { id: 'archived', codeParrain: 'EBN-X', nom: 'Archived', telephone: '000', statut: 'ARCHIVE' },
    ] } });
    render(<CodeParrainInput value="" onChange={() => {}} allowedStatuses={['ACTIF', 'EN_COURS']} />);
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: 'Parrain' } });
    expect(await screen.findByRole('button', { name: /Alice/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bruno/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archived/ })).not.toBeInTheDocument();
  });

  it('allows choosing a recruiter with the keyboard', async () => {
    get.mockResolvedValue({ data: { results: [alice] } });
    const onChange = vi.fn();
    render(<CodeParrainInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: 'Alice' } });
    fireEvent.click(await screen.findByRole('button', { name: /Alice/ }));
    expect(onChange).toHaveBeenCalledWith('EBN-A');
  });

  it('discards a slow response from an older search', async () => {
    let resolveOld!: (result: unknown) => void;
    get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    get.mockResolvedValueOnce({ data: { results: [bruno] } });
    render(<CodeParrainInput value="" onChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: 'Alice' } });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: 'Bruno' } });
    expect(await screen.findByRole('button', { name: /Bruno/ })).toBeInTheDocument();
    await act(async () => resolveOld({ data: { results: [alice] } }));
    expect(screen.queryByRole('button', { name: /Alice/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bruno/ })).toBeInTheDocument();
  });

  it('does not display a selected recruiter after the form value changes externally', async () => {
    get.mockResolvedValue({ data: { results: [alice] } });
    const onChange = vi.fn();
    const { rerender } = render(<CodeParrainInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: 'Alice' } });
    fireEvent.mouseDown(await screen.findByRole('button', { name: /Alice/ }));
    rerender(<CodeParrainInput value="EBN-A" onChange={onChange} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    rerender(<CodeParrainInput value="" onChange={onChange} />);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(placeholder)).toHaveValue('');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
