import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from '@react-pdf/renderer';
import { formatUSD } from '@/lib/utils';

Font.registerHyphenationCallback((word) => [word]);

export interface FicheAdhesionData {
  nomComplet: string;
  telephone: string;
  email?: string;
  adresse?: string;
  ville: string;
  numeroFiche: string;
  dateActivation: string;
  parrainNom?: string;
  parrainCode?: string;
  agentNom: string;
  produitNom: string;
  produitPrix: number;
  pointsCumules: number;
}

// ── Couleurs fidèles au formulaire papier ────────────────────────────────────
const BLUE = '#1E3A5F';
const RED  = '#CC0000';
const BLACK = '#000000';
const BORDER = '#000000';
const DOT_BORDER = '#666666';
const LOGO_URL = '/assets/Progress business logo.png';

// A4 = 595×842pt — watermark centré
const WM = 340;
const WM_LEFT = (595 - WM) / 2;
const WM_TOP  = (842 - WM) / 2 + 40; // légèrement décalé vers le bas comme sur le papier

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 20,
    paddingBottom: 24,
    paddingLeft: 28,
    paddingRight: 28,
    color: BLACK,
    backgroundColor: '#FFFFFF',
    lineHeight: 1.3,
  },

  watermark: {
    position: 'absolute',
    top: WM_TOP,
    left: WM_LEFT,
    width: WM,
    height: WM,
    opacity: 0.08,
  },

  // ── Header ────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logo: {
    width: 65,
    height: 65,
  },
  companyBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  companyNameAccent: {
    fontFamily: 'Helvetica-Bold',
    color: RED,
  },
  companyMeta: {
    fontSize: 7.5,
    color: '#333333',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 1.5,
  },

  // ── Title (séparateur simple comme sur le papier) ─────────
  titleSeparator: {
    borderBottom: '1.5pt solid ' + BLACK,
    marginTop: 8,
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleText: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  ficheNumLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
  },

  // ── Info fields ───────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  infoLabel: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: 9.5,
    color: BLACK,
    borderBottom: '0.75pt dotted ' + DOT_BORDER,
    paddingBottom: 1,
    marginLeft: 3,
  },
  // Variante pour les champs multi-segments (Invité par, Adresse)
  infoValueFixed: {
    fontSize: 9.5,
    color: BLACK,
    borderBottom: '0.75pt dotted ' + DOT_BORDER,
    paddingBottom: 1,
    marginLeft: 3,
  },

  // ── Date + signature (section membre) ─────────────────────
  dateSignRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    marginBottom: 12,
  },
  dateSignBlock: {
    alignItems: 'flex-end',
  },
  dateSignText: {
    fontSize: 9,
    color: BLACK,
    textAlign: 'right',
  },
  signatureLabelSmall: {
    fontSize: 9,
    color: BLACK,
    marginTop: 3,
    textAlign: 'right',
  },

  // ── Table ─────────────────────────────────────────────────
  tableLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 4,
  },

  // ── Satisfaction ──────────────────────────────────────────
  satRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    marginBottom: 10,
  },
  satCheckbox: {
    width: 14,
    height: 14,
    border: '1pt solid ' + BLACK,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
    marginRight: 6,
  },
  satCheckMark: {
    fontSize: 10,
    color: RED,
    fontFamily: 'Helvetica-Bold',
  },
  satText: {
    fontSize: 9,
    color: RED,
    flex: 1,
    lineHeight: 1.5,
  },
  satBold: {
    fontFamily: 'Helvetica-Bold',
    color: RED,
  },

  // ── Footer ────────────────────────────────────────────────
  footerDateText: {
    fontSize: 9,
    color: BLACK,
    textAlign: 'center',
    marginBottom: 6,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 10,
  },
  footerSigBlock: {
    alignItems: 'center',
    width: 170,
  },
  footerSigLine: {
    borderBottom: '0.5pt solid ' + BLACK,
    width: 170,
    marginTop: 30,
    marginBottom: 3,
  },
  footerSigLabel: {
    fontSize: 9,
    color: BLACK,
    textAlign: 'center',
  },
});

// ── Colonnes du tableau (avec colonne Produit ajoutée) ──────────────────────
// Largeur utile A4 = 595 - 28 - 28 = 539pt
const C = {
  num:     25,   // N°
  date:    68,   // Date
  prix:    65,   // PRIX
  points:  52,   // Point cumulés
  agent:   100,  // Nom agent
  produit: 100,  // Produit
  sig:     100,  // Signature agent
  // total : 510pt (avec marges internes des bordures)
};

function cell(
  width: number,
  isHeader = false,
  align: 'left' | 'center' | 'right' = 'center',
) {
  return {
    width,
    borderRight: '0.75pt solid ' + BLACK,
    borderBottom: '0.75pt solid ' + BLACK,
    paddingTop: isHeader ? 4 : 6,
    paddingBottom: isHeader ? 4 : 6,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: isHeader ? 8 : 8.5,
    fontFamily: isHeader ? ('Helvetica-Bold' as const) : ('Helvetica' as const),
    color: BLACK,
    textAlign: align,
    flexShrink: 0,
  };
}

export function FicheAdhesionPDF({ data }: { data: FicheAdhesionData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Watermark — peint en premier, derrière tout ── */}
        <Image src={LOGO_URL} style={styles.watermark} />

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <Image src={LOGO_URL} style={styles.logo} />
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>
              ENTREPRISE BÉNIE{' '}
              <Text style={styles.companyNameAccent}>NETWORK</Text>
            </Text>
            <Text style={styles.companyMeta}>
              {'RCCM : RDC/RCCM/19-B-0615\nIDNAT : 5-83-N685001\nIMPOT : A19086215'}
            </Text>
          </View>
          <Image src={LOGO_URL} style={styles.logo} />
        </View>

        {/* ── Ligne de séparation (comme sur le papier) ─────────────── */}
        <View style={styles.titleSeparator} />

        {/* ── Title ────────────────────────────────────────────────── */}
        <View style={styles.titleRow}>
          <Text style={styles.titleText}>Fiche d'Adhésion Progressive</Text>
          <Text style={styles.ficheNumLabel}>N°{data.numeroFiche}</Text>
        </View>

        {/* ── Client info ──────────────────────────────────────────── */}
        {/* Nom & Post-nom */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Nom & Post-nom : </Text>
          <Text style={styles.infoValue}>{data.nomComplet}</Text>
        </View>

        {/* Inviter par : ........... N° ........... ou ID ........... */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Inviter par : </Text>
          <Text style={[styles.infoValueFixed, { flex: 1 }]}>{data.parrainNom ?? ''}</Text>
          <Text style={[styles.infoLabel, { marginLeft: 6 }]}>N° </Text>
          <Text style={[styles.infoValueFixed, { width: 60, flexShrink: 0 }]}>{data.parrainCode ?? ''}</Text>
          <Text style={[styles.infoLabel, { marginLeft: 6 }]}>ou ID </Text>
          <Text style={[styles.infoValueFixed, { width: 60, flexShrink: 0 }]}>{''}</Text>
        </View>

        {/* Adresse : ........................ Ville ........... */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Adresse : </Text>
          <Text style={[styles.infoValueFixed, { flex: 1 }]}>{data.adresse ?? ''}</Text>
          <Text style={[styles.infoLabel, { marginLeft: 6 }]}>Ville </Text>
          <Text style={[styles.infoValueFixed, { width: 100, flexShrink: 0 }]}>{data.ville}</Text>
        </View>

        {/* Téléphone */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Téléphone : </Text>
          <Text style={styles.infoValue}>{data.telephone}</Text>
        </View>

        {/* E-mail */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>E-mail : </Text>
          <Text style={styles.infoValue}>{data.email ?? ''}</Text>
        </View>

        {/* Date + Signature nouveau membre (aligné à droite) */}
        <View style={styles.dateSignRow}>
          <View style={styles.dateSignBlock}>
            <Text style={styles.dateSignText}>
              Fait à {data.ville}, le {data.dateActivation}
            </Text>
            <Text style={styles.signatureLabelSmall}>Signature du nouveau membre</Text>
          </View>
        </View>

        {/* ── COTATIONS DU MEMBRE ──────────────────────────────────── */}
        <Text style={styles.tableLabel}>COTATIONS DU MEMBRE</Text>

        {/* En-tête table */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: '#FFFFFF',
          borderTop: '0.75pt solid ' + BLACK,
          borderLeft: '0.75pt solid ' + BLACK,
        }}>
          <Text style={cell(C.num, true)}>N°</Text>
          <Text style={cell(C.date, true)}>Date</Text>
          <Text style={cell(C.prix, true)}>PRIX</Text>
          <Text style={cell(C.points, true)}>{'Point\ncumulés'}</Text>
          <Text style={cell(C.agent, true)}>Nom agent</Text>
          <Text style={cell(C.produit, true)}>Produit</Text>
          <Text style={cell(C.sig, true)}>{'Signature\nagent'}</Text>
        </View>

        {/* Ligne 1 — données réelles */}
        <View style={{ flexDirection: 'row', borderLeft: '0.75pt solid ' + BLACK }}>
          <Text style={cell(C.num)}>1.</Text>
          <Text style={cell(C.date, false, 'left')}>le {data.dateActivation}</Text>
          <Text style={cell(C.prix, false, 'right')}>{formatUSD(data.produitPrix)}</Text>
          <Text style={cell(C.points)}>{data.pointsCumules}P</Text>
          <Text style={cell(C.agent, false, 'left')}>{data.agentNom.toUpperCase()}</Text>
          <Text style={cell(C.produit, false, 'left')}>{data.produitNom}</Text>
          <Text style={cell(C.sig)}>{' '}</Text>
        </View>

        {/* Lignes vides 2–5 */}
        {[2, 3, 4, 5].map((n) => (
          <View key={n} style={{ flexDirection: 'row', borderLeft: '0.75pt solid ' + BLACK }}>
            <Text style={cell(C.num)}>{n}.</Text>
            <Text style={cell(C.date)}>{' '}</Text>
            <Text style={cell(C.prix)}>{' '}</Text>
            <Text style={cell(C.points)}>{' '}</Text>
            <Text style={cell(C.agent)}>{' '}</Text>
            <Text style={cell(C.produit)}>{' '}</Text>
            <Text style={cell(C.sig)}>{' '}</Text>
          </View>
        ))}

        {/* Ligne Points Total (pas de fond coloré, comme le papier) */}
        <View style={{
          flexDirection: 'row',
          borderLeft: '0.75pt solid ' + BLACK,
        }}>
          <Text style={{
            ...cell(C.num + C.date, false, 'left'),
            fontFamily: 'Helvetica-Bold',
          }}>Points Total</Text>
          <Text style={cell(C.prix, false, 'right')}>{formatUSD(data.produitPrix)}</Text>
          <Text style={cell(C.points)}>{data.pointsCumules}P</Text>
          <Text style={cell(C.agent, false, 'left')}>{data.agentNom.toUpperCase()}</Text>
          <Text style={cell(C.produit)}>{' '}</Text>
          <Text style={cell(C.sig)}>{' '}</Text>
        </View>

        {/* ── Satisfaction (texte noir comme le papier) ─────────────── */}
        <View style={styles.satRow}>
          <View style={styles.satCheckbox}>
            <Text style={styles.satCheckMark}>✓</Text>
          </View>
          <Text style={styles.satText}>
            <Text style={styles.satBold}>
              Le membre a atteint les points de satisfaction (40 points),{' '}
            </Text>
            Désormais membre officiel de{' '}
            <Text style={styles.satBold}>EBN NETWORK</Text>
          </Text>
        </View>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <Text style={styles.footerDateText}>
          Fait à {data.ville}, le {data.dateActivation}
        </Text>

        <View style={styles.footerRow}>
          <View style={styles.footerSigBlock}>
            <View style={styles.footerSigLine} />
            <Text style={styles.footerSigLabel}>Signature du membre</Text>
          </View>
          <View style={styles.footerSigBlock}>
            <View style={styles.footerSigLine} />
            <Text style={styles.footerSigLabel}>Signature agent</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
