// Keep financial figures stationary and easy to read on pointer and touch devices.
const TiltWrapper = ({ children, style = {}, className = '' }) => (
  <div className={`tilt-wrapper ${className}`} style={style}>{children}</div>
);

export default TiltWrapper;
