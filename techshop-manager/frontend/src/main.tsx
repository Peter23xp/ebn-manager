import ReactDOM from 'react-dom/client';
import App from './App';
import { Root } from './Root';
import './lib/chartjs';
import './index.css';

const container = document.getElementById('root')!;
const tree = (
  <Root>
    <App />
  </Root>
);

// Les pages publiques (/, /legal/*, 404) sont pré-rendues au build
// (scripts/prerender.mjs) : leur HTML est déjà dans #root, lisible par les
// moteurs de recherche et les robots IA sans exécuter de JavaScript. On
// l'hydrate. Les écrans de l'application arrivent avec un #root vide.
if (container.hasChildNodes()) {
  ReactDOM.hydrateRoot(container, tree);
} else {
  ReactDOM.createRoot(container).render(tree);
}
