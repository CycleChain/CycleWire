// Mounts React islands. CycleWire decides when (cw-trigger on the
// island's element); this module, React and the component are downloaded
// only then.
import { hydrateRoot } from 'react-dom/client';
import { removed } from '../../shared/removed.js';
import { Counter } from '../components/Counter.jsx';

export function counter({ element, props }) {
    // The server rendered <Counter> with these same props, so React hydrates
    // that HTML instead of rendering it again. Without server rendering, use
    // createRoot(element).render(<Counter {...props} />).
    const root = hydrateRoot(element, <Counter {...props} />);
    removed(element).then(() => root.unmount());
}
