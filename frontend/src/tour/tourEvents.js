// "Replay app tour" triggers (Navbar menu, Settings -> Help) dispatch a DOM
// event rather than importing the tour's state -- the same pattern as the
// Navbar's GlobalSearch trigger. TourProvider listens for it.
export const START_TOUR_EVENT = 'flacron:start-tour';

export const startProductTour = () => window.dispatchEvent(new CustomEvent(START_TOUR_EVENT));
