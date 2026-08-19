import { create } from 'zustand';
import type { ModePaiement } from '@/types';
import type { ProduitPOS } from '@/lib/ventes.api';

export interface CartItem {
  produitId: string;
  sku: string;
  nom: string;
  categorie: string;
  prixUnitaire: number;
  quantite: number;
  stockDisponible: number;
}

export interface CartClient {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
}

interface CartState {
  items: CartItem[];
  client: CartClient | null;
  modePaiement: ModePaiement | null;
  montantRecu: number;
  appliquerRemise: boolean;
  isSubmitting: boolean;
  lastVenteResult: {
    id: string;
    numeroVente: string;
    montantNet: number;
    pointsAttribues?: number;
  } | null;

  // computed
  montantBrut: () => number;
  remiseMontant: () => number;
  montantNet: () => number;
  monnaieARendre: () => number;

  // actions
  addItem: (produit: ProduitPOS) => void;
  removeItem: (produitId: string) => void;
  updateQuantite: (produitId: string, delta: number) => void;
  setClient: (client: CartClient | null) => void;
  setModePaiement: (mode: ModePaiement | null) => void;
  setMontantRecu: (montant: number) => void;
  toggleRemise: () => void;
  setIsSubmitting: (v: boolean) => void;
  resetAfterSale: (result: CartState['lastVenteResult']) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  client: null,
  modePaiement: null,
  montantRecu: 0,
  appliquerRemise: true,
  isSubmitting: false,
  lastVenteResult: null,

  montantBrut: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.prixUnitaire * item.quantite, 0);
  },

  remiseMontant: () => {
    return 0; // Removed with MLM migration
  },

  montantNet: () => {
    return get().montantBrut() - get().remiseMontant();
  },

  monnaieARendre: () => {
    const { modePaiement, montantRecu } = get();
    if (modePaiement !== 'CASH') return 0;
    const net = get().montantNet();
    return montantRecu > net ? montantRecu - net : 0;
  },

  addItem: (produit: ProduitPOS) => {
    if (produit.statut === 'RUPTURE') return;
    set((state) => {
      const existing = state.items.find((i) => i.produitId === produit.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.produitId === produit.id
              ? { ...i, quantite: Math.min(i.quantite + 1, i.stockDisponible) }
              : i,
          ),
        };
      }
      const newItem: CartItem = {
        produitId: produit.id,
        sku: produit.sku,
        nom: produit.nom,
        categorie: produit.categorie,
        prixUnitaire: produit.prixVente,
        quantite: 1,
        stockDisponible: produit.stockDisponible,
      };
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (produitId: string) => {
    set((state) => ({ items: state.items.filter((i) => i.produitId !== produitId) }));
  },

  updateQuantite: (produitId: string, delta: number) => {
    set((state) => ({
      items: state.items.map((i) => {
        if (i.produitId !== produitId) return i;
        // delta=-1 et quantite=1 → ne rien faire
        if (delta < 0 && i.quantite === 1) return i;
        const newQty = Math.max(1, Math.min(i.quantite + delta, i.stockDisponible));
        return { ...i, quantite: newQty };
      }),
    }));
  },

  setClient: (client: CartClient | null) => set({ client }),

  setModePaiement: (modePaiement: ModePaiement | null) => set({ modePaiement }),

  setMontantRecu: (montantRecu: number) => set({ montantRecu }),

  toggleRemise: () => set((state) => ({ appliquerRemise: !state.appliquerRemise })),

  setIsSubmitting: (isSubmitting: boolean) => set({ isSubmitting }),

  resetAfterSale: (result) => {
    set({
      items: [],
      client: null,
      modePaiement: null,
      montantRecu: 0,
      appliquerRemise: true,
      isSubmitting: false,
      lastVenteResult: result,
    });
  },

  clearCart: () => {
    set({
      items: [],
      client: null,
      modePaiement: null,
      montantRecu: 0,
      appliquerRemise: true,
      isSubmitting: false,
      lastVenteResult: null,
    });
  },
}));


