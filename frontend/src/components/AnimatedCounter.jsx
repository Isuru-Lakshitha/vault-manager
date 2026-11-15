/**
 * Renders formatted financial figures immediately with zero main-thread RAF state thrashing.
 */
const AnimatedCounter = ({ value, formatter = (v) => v.toLocaleString(), style = {} }) => (
  <span style={style}>{Number.isFinite(value) ? formatter(value) : 'Unavailable'}</span>
);

export default AnimatedCounter;
