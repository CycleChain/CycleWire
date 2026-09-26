// The page's one script. Importing Turbo starts Turbo Drive, Frames and
// Streams; the page calls none of Turbo's functions, so it is imported for its
// side effects only, as the installation guide suggests. Stimulus starts next,
// with the page's two controllers registered by hand, the way the Stimulus
// handbook shows for build systems other than Rails'.
import '@hotwired/turbo';
import { Application } from '@hotwired/stimulus';
import QuickViewController from './controllers/quick_view_controller.js';
import SearchController from './controllers/search_controller.js';

window.Stimulus = Application.start();
Stimulus.register('quick-view', QuickViewController);
Stimulus.register('search', SearchController);
