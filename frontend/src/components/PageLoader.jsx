const PageLoader = () => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-white"
    role="status"
    aria-live="polite"
    aria-label="Loading FlacronAI"
  >
    <video
      className="h-full w-full object-cover"
      src="/pre-loading.mp4"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
    />
    <span className="sr-only">Loading FlacronAI…</span>
  </div>
);

export default PageLoader;
