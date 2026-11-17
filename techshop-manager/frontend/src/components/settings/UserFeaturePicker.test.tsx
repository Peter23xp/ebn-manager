import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFeaturePicker, retireesForRole } from './UserFeaturePicker';

describe('UserFeaturePicker', () => {
  it('décocher une case retire la fonctionnalité', async () => {
    const onChange = vi.fn();
    render(<UserFeaturePicker role="GERANT" retirees={[]} onChange={onChange} />);
    const rapports = screen.getByRole('checkbox', { name: /Rapports et exports/ });
    expect(rapports).toBeChecked();
    await userEvent.click(rapports);
    expect(onChange).toHaveBeenCalledWith(['rapports']);
  });

  it('recocher une case rend la fonctionnalité', async () => {
    const onChange = vi.fn();
    render(<UserFeaturePicker role="GERANT" retirees={['rapports', 'mlm']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Rapports et exports/ }));
    expect(onChange).toHaveBeenCalledWith(['mlm']);
  });

  it('ne propose pas au caissier ce que son rôle ne permet pas', () => {
    render(<UserFeaturePicker role="CAISSIER" retirees={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Caisse et ventes/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Rapports/ })).not.toBeInTheDocument();
  });

  it('ne propose aucune case pour le super admin', () => {
    render(<UserFeaturePicker role="SUPER_ADMIN" retirees={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('à l’enregistrement, oublie les retraits qui n’ont plus de sens pour le rôle', () => {
    expect(retireesForRole('AGENT', ['rapports', 'stocks'])).toEqual(['stocks']);
    expect(retireesForRole('SUPER_ADMIN', ['stocks'])).toEqual([]);
  });
});
