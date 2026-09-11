/* @ds-bundle: {"format":4,"namespace":"StayableDesignSystem_11a9a8","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Logo","sourcePath":"components/core/Logo.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"DateField","sourcePath":"components/forms/DateField.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"AmenityTile","sourcePath":"components/marketing/AmenityTile.jsx"},{"name":"BookingBar","sourcePath":"components/marketing/BookingBar.jsx"},{"name":"PropertyCard","sourcePath":"components/marketing/PropertyCard.jsx"},{"name":"SectionHeading","sourcePath":"components/marketing/SectionHeading.jsx"},{"name":"Accordion","sourcePath":"components/navigation/Accordion.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"210143e53273","components/core/Button.jsx":"70bc43a8c3f4","components/core/Card.jsx":"ec8f90035f1e","components/core/Icon.jsx":"54d1648628b0","components/core/IconButton.jsx":"d38fe6c7f9c6","components/core/Logo.jsx":"8d5b0a2f8a22","components/core/Tag.jsx":"b1ebeab70b97","components/feedback/Dialog.jsx":"41df3d8c8d84","components/feedback/Toast.jsx":"83510951087b","components/feedback/Tooltip.jsx":"b60ce65f6c8d","components/forms/Checkbox.jsx":"ff26e33837f5","components/forms/DateField.jsx":"6b16032e4f79","components/forms/Field.jsx":"032e5088c00a","components/forms/Input.jsx":"7058b511c946","components/forms/Radio.jsx":"30793463f93d","components/forms/Select.jsx":"aa6bff5a3109","components/forms/Switch.jsx":"3c29f6cdfddb","components/marketing/AmenityTile.jsx":"351500222595","components/marketing/BookingBar.jsx":"a7d35e1403de","components/marketing/PropertyCard.jsx":"d5a1490a503c","components/marketing/SectionHeading.jsx":"951c29601dd1","components/navigation/Accordion.jsx":"cbdb89a31614","components/navigation/Tabs.jsx":"978a18f04915","ui_kits/booking/BookingFlow.jsx":"2ccc8b405873","ui_kits/website/App.jsx":"416d907c1358","ui_kits/website/ContactPage.jsx":"e05405d9e9a2","ui_kits/website/HomePage.jsx":"91f4aa3cdbaf","ui_kits/website/LocationPage.jsx":"152878ccf26f","ui_kits/website/OffersPage.jsx":"803a648e8c52","ui_kits/website/Photo.jsx":"5797bc736d67","ui_kits/website/SiteChrome.jsx":"1941f7994eb7"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.StayableDesignSystem_11a9a8 = window.StayableDesignSystem_11a9a8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  neutral: {
    background: 'var(--navy-050)',
    color: 'var(--text-body)'
  },
  accent: {
    background: 'var(--surface-accent-soft)',
    color: 'var(--sky-700)'
  },
  success: {
    background: 'var(--status-success-soft)',
    color: 'var(--status-success)'
  },
  warning: {
    background: 'var(--status-warning-soft)',
    color: 'var(--status-warning)'
  },
  danger: {
    background: 'var(--status-danger-soft)',
    color: 'var(--status-danger)'
  },
  inverse: {
    background: 'var(--navy-800)',
    color: 'var(--white)'
  }
};
function Badge({
  tone = 'neutral',
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-1)',
      padding: '4px 10px',
      borderRadius: 'var(--radius-pill)',
      font: 'var(--type-label)',
      fontSize: 'var(--fs-caption)',
      letterSpacing: '.02em',
      ...tones[tone],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  interactive = false,
  padded = true,
  tone = 'default',
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const tones = {
    default: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)'
    },
    warm: {
      background: 'var(--surface-warm)',
      border: '1px solid var(--sand-200)'
    },
    inverse: {
      background: 'var(--surface-inverse)',
      border: '1px solid var(--border-inverse)',
      color: 'var(--text-inverse)'
    },
    accent: {
      background: 'var(--surface-accent-soft)',
      border: '1px solid var(--sky-200)'
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      boxShadow: hover && interactive ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      transform: hover && interactive ? 'var(--lift-card)' : 'none',
      transition: 'var(--transition-card)',
      cursor: interactive ? 'pointer' : undefined,
      padding: padded ? 'var(--card-pad)' : 0,
      ...tones[tone],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Lucide (via lucide-static CDN) is the substituted icon set — see readme ICONOGRAPHY.
   Rendered as a CSS mask so glyphs inherit currentColor. */
const CDN = 'https://unpkg.com/lucide-static@0.462.0/icons/';
function Icon({
  name = 'circle',
  size = 20,
  strokeWidth,
  style,
  ...rest
}) {
  const url = `url("${CDN}${name}.svg")`;
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-hidden": "true",
    "data-icon": name,
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      flex: '0 0 auto',
      backgroundColor: 'currentColor',
      WebkitMaskImage: url,
      maskImage: url,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      opacity: strokeWidth === 'light' ? 0.7 : 1,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const sizes = {
  sm: {
    height: 'var(--control-h-sm)',
    padding: '0 18px',
    fontSize: 'var(--fs-body-sm)'
  },
  md: {
    height: 'var(--control-h)',
    padding: '0 26px',
    fontSize: 'var(--fs-body)'
  },
  lg: {
    height: 'var(--control-h-lg)',
    padding: '0 34px',
    fontSize: 'var(--fs-body-lg)'
  }
};
const variants = {
  primary: {
    background: 'var(--action-primary)',
    color: 'var(--text-inverse)',
    border: '2px solid var(--action-primary)'
  },
  accent: {
    background: 'var(--action-accent)',
    color: 'var(--navy-800)',
    border: '2px solid var(--action-accent)'
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-strong)',
    border: '2px solid var(--border-strong)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-strong)',
    border: '2px solid transparent'
  },
  inverse: {
    background: 'var(--white)',
    color: 'var(--navy-800)',
    border: '2px solid var(--white)'
  },
  'inverse-outline': {
    background: 'transparent',
    color: 'var(--white)',
    border: '2px solid rgba(255,255,255,.7)'
  }
};
const hovers = {
  primary: {
    background: 'var(--action-primary-hover)',
    borderColor: 'var(--action-primary-hover)'
  },
  accent: {
    background: 'var(--action-accent-hover)',
    borderColor: 'var(--action-accent-hover)'
  },
  secondary: {
    background: 'var(--navy-800)',
    color: 'var(--text-inverse)'
  },
  ghost: {
    background: 'var(--navy-050)'
  },
  inverse: {
    background: 'var(--sky-100)',
    borderColor: 'var(--sky-100)'
  },
  'inverse-outline': {
    background: 'rgba(255,255,255,.12)',
    borderColor: 'var(--white)'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  fullWidth = false,
  disabled = false,
  children,
  style,
  onClick,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-2)',
      width: fullWidth ? '100%' : undefined,
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-semibold)',
      letterSpacing: '.02em',
      textTransform: 'uppercase',
      borderRadius: 'var(--radius-control)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'var(--transition-control)',
      whiteSpace: 'nowrap',
      ...sizes[size],
      ...variants[variant],
      ...(hover && !disabled ? hovers[variant] : null),
      ...(press && !disabled ? {
        transform: 'var(--press-scale)'
      } : null),
      ...(disabled ? {
        background: 'var(--action-disabled)',
        borderColor: 'var(--action-disabled)',
        color: 'var(--text-subtle)'
      } : null),
      ...style
    }
  }, rest), iconLeft ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: size === 'lg' ? 20 : 17
  }) : null, children, iconRight ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: size === 'lg' ? 20 : 17
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const dims = {
  sm: 36,
  md: 44,
  lg: 54
};
function IconButton({
  icon = 'x',
  size = 'md',
  variant = 'ghost',
  label,
  disabled,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const base = {
    ghost: {
      background: 'transparent',
      color: 'var(--text-strong)',
      border: '1px solid transparent'
    },
    outline: {
      background: 'var(--white)',
      color: 'var(--text-strong)',
      border: '1px solid var(--border-default)'
    },
    solid: {
      background: 'var(--action-primary)',
      color: 'var(--text-inverse)',
      border: '1px solid var(--action-primary)'
    },
    inverse: {
      background: 'rgba(255,255,255,.14)',
      color: 'var(--white)',
      border: '1px solid var(--border-inverse)'
    }
  }[variant];
  const hov = {
    ghost: {
      background: 'var(--navy-050)'
    },
    outline: {
      borderColor: 'var(--navy-800)'
    },
    solid: {
      background: 'var(--action-primary-hover)',
      borderColor: 'var(--action-primary-hover)'
    },
    inverse: {
      background: 'rgba(255,255,255,.26)'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: dims[size],
      height: dims[size],
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-pill)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'var(--transition-control)',
      opacity: disabled ? 0.45 : 1,
      ...base,
      ...(hover && !disabled ? hov : null),
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 16 : size === 'lg' ? 24 : 20
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SRC = {
  dark: 'assets/stayable-logo-dark.png',
  // navy wordmark — for light surfaces
  light: 'assets/stayable-logo-light.png',
  // white wordmark — for navy surfaces
  mark: 'assets/stayable-mark-chevron.png' // chevron only
};

/* basePath is the relative prefix from the consuming page to the design-system root,
   e.g. "../../" for a file two directories deep. */
function Logo({
  variant = 'dark',
  height = 40,
  basePath = '',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("img", _extends({
    src: basePath + SRC[variant],
    alt: "Stayable",
    style: {
      height,
      width: 'auto',
      display: 'block',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Logo.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tag({
  icon,
  selected = false,
  onRemove,
  children,
  onClick,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: '7px 14px',
      borderRadius: 'var(--radius-pill)',
      border: '1px solid ' + (selected ? 'var(--navy-800)' : 'var(--border-default)'),
      background: selected ? 'var(--navy-800)' : 'var(--white)',
      color: selected ? 'var(--white)' : 'var(--text-body)',
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15
  }) : null, children, onRemove ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 14,
    style: {
      cursor: 'pointer',
      opacity: .6
    },
    onClick: onRemove
  }) : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Dialog({
  open = true,
  title,
  subtitle,
  onClose,
  footer,
  width = 520,
  children,
  style,
  ...rest
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scrim-flat)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-6)',
      zIndex: 50
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", _extends({
    onClick: e => e.stopPropagation(),
    style: {
      width,
      maxWidth: '100%',
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-overlay)',
      overflow: 'hidden',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-4)',
      padding: 'var(--space-6) var(--space-6) var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title ? /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      font: 'var(--type-card-title)',
      color: 'var(--text-strong)'
    }
  }, title) : null, subtitle ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      font: 'var(--type-body)',
      color: 'var(--text-muted)'
    }
  }, subtitle) : null), onClose ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    size: "sm",
    label: "Close",
    onClick: onClose
  }) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 var(--space-6) var(--space-6)',
      font: 'var(--type-body)',
      color: 'var(--text-body)'
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 'var(--space-3)',
      padding: 'var(--space-4) var(--space-6)',
      background: 'var(--navy-050)'
    }
  }, footer) : null));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  info: {
    icon: 'info',
    color: 'var(--status-info)',
    bg: 'var(--status-info-soft)'
  },
  success: {
    icon: 'circle-check',
    color: 'var(--status-success)',
    bg: 'var(--status-success-soft)'
  },
  warning: {
    icon: 'triangle-alert',
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-soft)'
  },
  danger: {
    icon: 'circle-alert',
    color: 'var(--status-danger)',
    bg: 'var(--status-danger-soft)'
  }
};
function Toast({
  tone = 'info',
  title,
  children,
  onClose,
  style,
  ...rest
}) {
  const t = tones[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-3)',
      padding: 'var(--space-4)',
      background: 'var(--white)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-md)',
      minWidth: 300,
      maxWidth: 440,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-pill)',
      background: t.bg,
      color: t.color,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-label)',
      fontSize: 'var(--fs-body)',
      color: 'var(--text-strong)'
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, children) : null), onClose ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    size: "sm",
    label: "Dismiss",
    onClick: onClose
  }) : null);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tooltip({
  label,
  placement = 'top',
  children,
  style,
  ...rest
}) {
  const [show, setShow] = React.useState(false);
  const pos = placement === 'bottom' ? {
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)'
  } : {
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)'
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    },
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false)
  }, rest), children, show ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      ...pos,
      whiteSpace: 'nowrap',
      zIndex: 60,
      background: 'var(--navy-800)',
      color: 'var(--white)',
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)',
      padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      boxShadow: 'var(--shadow-md)'
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  checked = false,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      font: 'var(--type-body)',
      color: 'var(--text-body)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 22,
      height: 22,
      flex: '0 0 auto',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-xs)',
      background: checked ? 'var(--navy-800)' : 'var(--white)',
      border: '2px solid ' + (checked ? 'var(--navy-800)' : 'var(--border-default)'),
      color: 'var(--sky-400)',
      transition: 'var(--transition-control)'
    }
  }, checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14
  }) : null), label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/DateField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function DateField({
  label = 'Arrival',
  value,
  onChange,
  size = 'md',
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'lg' ? 'var(--control-h-lg)' : 'var(--control-h)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      height: h,
      padding: '0 16px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--white)',
      border: '1px solid ' + (focus ? 'var(--navy-800)' : 'var(--border-default)'),
      boxShadow: focus ? 'var(--ring-focus)' : 'none',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "calendar-days",
    size: 18,
    style: {
      color: 'var(--text-muted)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: value,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-strong)',
      padding: 0
    }
  })));
}
Object.assign(__ds_scope, { DateField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/DateField.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      ...style
    }
  }, rest), label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-strong)'
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--status-danger)'
    }
  }, " *") : null) : null, children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)',
      color: 'var(--status-danger)'
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)',
      color: 'var(--text-muted)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  icon,
  invalid = false,
  disabled,
  size = 'md',
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'lg' ? 'var(--control-h-lg)' : size === 'sm' ? 'var(--control-h-sm)' : 'var(--control-h)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      height: h,
      padding: '0 16px',
      borderRadius: 'var(--radius-sm)',
      background: disabled ? 'var(--navy-050)' : 'var(--white)',
      border: '1px solid ' + (invalid ? 'var(--status-danger)' : focus ? 'var(--navy-800)' : 'var(--border-default)'),
      boxShadow: focus ? 'var(--ring-focus)' : 'none',
      transition: 'var(--transition-control)',
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 17,
    style: {
      color: 'var(--text-muted)'
    }
  }) : null, /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'var(--type-body)',
      color: 'var(--text-strong)'
    }
  }, rest)));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Radio({
  checked = false,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      font: 'var(--type-body)',
      color: 'var(--text-body)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(true),
    style: {
      width: 22,
      height: 22,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-pill)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid ' + (checked ? 'var(--navy-800)' : 'var(--border-default)'),
      background: 'var(--white)',
      transition: 'var(--transition-control)'
    }
  }, checked ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--navy-800)'
    }
  }) : null), label);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  options = [],
  placeholder = 'Choose…',
  size = 'md',
  disabled,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'lg' ? 'var(--control-h-lg)' : size === 'sm' ? 'var(--control-h-sm)' : 'var(--control-h)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      height: h,
      borderRadius: 'var(--radius-sm)',
      background: disabled ? 'var(--navy-050)' : 'var(--white)',
      border: '1px solid ' + (focus ? 'var(--navy-800)' : 'var(--border-default)'),
      boxShadow: focus ? 'var(--ring-focus)' : 'none',
      transition: 'var(--transition-control)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      appearance: 'none',
      WebkitAppearance: 'none',
      flex: 1,
      height: '100%',
      padding: '0 40px 0 16px',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'var(--type-body)',
      color: 'var(--text-strong)',
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, rest), /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder), options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 18,
    style: {
      position: 'absolute',
      right: 14,
      color: 'var(--text-muted)',
      pointerEvents: 'none'
    }
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Switch({
  checked = false,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      font: 'var(--type-body)',
      color: 'var(--text-body)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 48,
      height: 28,
      borderRadius: 'var(--radius-pill)',
      padding: 3,
      flex: '0 0 auto',
      background: checked ? 'var(--sky-400)' : 'var(--navy-200)',
      transition: 'background-color var(--dur-base) var(--ease-standard)',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--white)',
      boxShadow: 'var(--shadow-xs)',
      transform: checked ? 'translateX(20px)' : 'translateX(0)',
      transition: 'transform var(--dur-base) var(--ease-out)'
    }
  })), label);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/marketing/AmenityTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function AmenityTile({
  icon = 'wifi',
  label,
  note,
  inverse = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 48,
      height: 48,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-pill)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: inverse ? 'rgba(255,255,255,.10)' : 'var(--surface-accent-soft)',
      color: inverse ? 'var(--sky-400)' : 'var(--sky-700)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      fontSize: 'var(--fs-body)',
      color: inverse ? 'var(--text-inverse)' : 'var(--text-strong)'
    }
  }, label), note ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)',
      color: inverse ? 'var(--text-inverse-muted)' : 'var(--text-muted)'
    }
  }, note) : null));
}
Object.assign(__ds_scope, { AmenityTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/AmenityTile.jsx", error: String((e && e.message) || e) }); }

// components/marketing/BookingBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function BookingBar({
  locations = [],
  value = {},
  onChange = () => {},
  onSearch,
  inverse = false,
  style,
  ...rest
}) {
  const set = k => e => onChange({
    ...value,
    [k]: e.target ? e.target.value : e
  });
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr 1fr auto',
      gap: 'var(--space-3)',
      alignItems: 'end',
      padding: 'var(--space-4)',
      borderRadius: 'var(--radius-lg)',
      background: inverse ? 'rgba(255,255,255,.10)' : 'var(--white)',
      backdropFilter: inverse ? 'blur(10px)' : undefined,
      border: '1px solid ' + (inverse ? 'var(--border-inverse)' : 'var(--border-subtle)'),
      boxShadow: inverse ? 'none' : 'var(--shadow-lg)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Select, {
    size: "lg",
    options: locations,
    placeholder: "Choose a Location",
    value: value.location || '',
    onChange: set('location')
  }), /*#__PURE__*/React.createElement(__ds_scope.DateField, {
    size: "lg",
    label: "Arrival",
    value: value.arrival || '',
    onChange: set('arrival')
  }), /*#__PURE__*/React.createElement(__ds_scope.DateField, {
    size: "lg",
    label: "Departure",
    value: value.departure || '',
    onChange: set('departure')
  }), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "lg",
    variant: "accent",
    iconRight: "arrow-right",
    onClick: onSearch
  }, "Search"));
}
Object.assign(__ds_scope, { BookingBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/BookingBar.jsx", error: String((e && e.message) || e) }); }

// components/marketing/PropertyCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PropertyCard({
  name,
  region = 'Florida',
  image,
  blurb,
  rate,
  tags = [],
  onBook,
  onView,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      border: '1px solid var(--border-subtle)',
      boxShadow: hover ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      transform: hover ? 'var(--lift-card)' : 'none',
      transition: 'var(--transition-card)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '16 / 10',
      background: 'var(--navy-100) center/cover no-repeat',
      backgroundImage: image ? `url(${image})` : undefined
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scrim-image)'
    }
  }), rate ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 14,
      left: 14
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "inverse"
  }, rate)) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 18,
      bottom: 14,
      color: 'var(--white)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      opacity: .85
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "map-pin",
    size: 13
  }), region), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-card-title)',
      fontSize: 'var(--fs-h2)'
    }
  }, name))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      padding: 'var(--card-pad)',
      flex: 1
    }
  }, blurb ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body)',
      color: 'var(--text-body)',
      textWrap: 'pretty'
    }
  }, blurb) : null, tags.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--space-2)'
    }
  }, tags.map(t => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: t,
    tone: "accent"
  }, t))) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    onClick: onBook
  }, "Book Now"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    variant: "secondary",
    onClick: onView
  }, "View Location"))));
}
Object.assign(__ds_scope, { PropertyCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/PropertyCard.jsx", error: String((e && e.message) || e) }); }

// components/marketing/SectionHeading.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'left',
  inverse = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      textAlign: align,
      alignItems: align === 'center' ? 'center' : 'flex-start',
      maxWidth: align === 'center' ? 720 : 640,
      ...style
    }
  }, rest), eyebrow ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      color: inverse ? 'var(--sky-400)' : 'var(--sky-600)'
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-section-title)',
      letterSpacing: 'var(--ls-heading)',
      color: inverse ? 'var(--text-inverse)' : 'var(--text-strong)',
      textWrap: 'pretty'
    }
  }, title), body ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body-lg)',
      textWrap: 'pretty',
      color: inverse ? 'var(--text-inverse-muted)' : 'var(--text-body)'
    }
  }, body) : null);
}
Object.assign(__ds_scope, { SectionHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/SectionHeading.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Accordion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Accordion({
  items = [],
  defaultOpen = -1,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderTop: '1px solid var(--border-subtle)',
      ...style
    }
  }, rest), items.map((it, i) => {
    const on = open === i;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        borderBottom: '1px solid var(--border-subtle)'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(on ? -1 : i),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        padding: 'var(--space-5) 0',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'var(--type-card-title)',
        fontSize: 'var(--fs-h4)',
        color: 'var(--text-strong)'
      }
    }, it.question ?? it.title, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: on ? 'minus' : 'plus',
      size: 20,
      style: {
        color: 'var(--sky-600)'
      }
    })), on ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 0 var(--space-5)',
        font: 'var(--type-body)',
        color: 'var(--text-body)',
        maxWidth: '68ch'
      }
    }, it.answer ?? it.body) : null);
  }));
}
Object.assign(__ds_scope, { Accordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Accordion.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tabs({
  items = [],
  value,
  onChange,
  variant = 'underline',
  style,
  ...rest
}) {
  const active = value ?? (items[0] && (items[0].value ?? items[0]));
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: 'flex',
      gap: variant === 'pill' ? 'var(--space-2)' : 'var(--space-6)',
      borderBottom: variant === 'underline' ? '1px solid var(--border-subtle)' : 'none',
      ...style
    }
  }, rest), items.map(it => {
    const v = it.value ?? it;
    const l = it.label ?? it;
    const on = v === active;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange && onChange(v),
      style: variant === 'pill' ? {
        border: 'none',
        cursor: 'pointer',
        padding: '9px 18px',
        borderRadius: 'var(--radius-pill)',
        font: 'var(--type-label)',
        transition: 'var(--transition-control)',
        background: on ? 'var(--navy-800)' : 'var(--navy-050)',
        color: on ? 'var(--white)' : 'var(--text-body)'
      } : {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '0 0 14px',
        font: 'var(--type-label)',
        fontSize: 'var(--fs-body)',
        color: on ? 'var(--text-strong)' : 'var(--text-muted)',
        boxShadow: on ? 'inset 0 -3px 0 var(--sky-400)' : 'none',
        transition: 'var(--transition-control)'
      }
    }, l);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/booking/BookingFlow.jsx
try { (() => {
const {
  Logo,
  Button,
  IconButton,
  Badge,
  Card,
  Field,
  Input,
  Select,
  DateField,
  Checkbox,
  Radio,
  Switch,
  Tag,
  Tabs,
  Icon,
  Toast,
  Tooltip,
  AmenityTile,
  SectionHeading,
  BookingBar
} = window.StayableDesignSystem_11a9a8;
const STEPS = ['Search', 'Suites', 'Details', 'Confirm'];
const RESULTS = [{
  name: 'Studio Suite',
  sleeps: '1–2 guests',
  size: '325 sq ft',
  week: 329,
  feat: ['Queen bed', 'Kitchenette', 'Full-size fridge'],
  left: 4
}, {
  name: 'One Bedroom Suite',
  sleeps: '1–4 guests',
  size: '480 sq ft',
  week: 389,
  feat: ['Separate bedroom', 'Sofa bed', 'Full kitchen'],
  left: 2
}, {
  name: 'Two Bedroom Suite',
  sleeps: '2–6 guests',
  size: '620 sq ft',
  week: 459,
  feat: ['Two bedrooms', 'Two TVs', 'Full kitchen'],
  left: 6
}];
function Shell({
  step,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      background: 'var(--surface-page-alt)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      background: 'var(--navy-800)',
      padding: '0 var(--gutter-page-lg)',
      height: 72,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "light",
    height: 32,
    basePath: "../../"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)',
      marginLeft: 'auto'
    }
  }, STEPS.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 'var(--radius-pill)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      font: 'var(--type-label)',
      fontSize: 12,
      background: i <= step ? 'var(--sky-400)' : 'rgba(255,255,255,.14)',
      color: i <= step ? 'var(--navy-800)' : 'var(--text-inverse-muted)'
    }
  }, i < step ? '✓' : i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      color: i <= step ? 'var(--text-inverse)' : 'var(--text-inverse-muted)'
    }
  }, s), i < STEPS.length - 1 ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 1,
      background: 'var(--border-inverse)',
      marginLeft: 6
    }
  }) : null))), /*#__PURE__*/React.createElement(IconButton, {
    icon: "circle-help",
    label: "Help",
    variant: "inverse",
    size: "sm"
  })), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      maxWidth: 1120,
      width: '100%',
      margin: '0 auto',
      padding: 'var(--space-8) var(--gutter-page-lg)'
    }
  }, children));
}
function Summary({
  q,
  suite,
  extras
}) {
  const weeks = 4;
  const base = suite ? suite.week * weeks : 0;
  const house = extras.housekeeping ? 45 * weeks : 0;
  const pet = extras.pet ? 120 : 0;
  const damage = 150;
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      position: 'sticky',
      top: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      font: 'var(--type-card-title)',
      color: 'var(--text-strong)'
    }
  }, "Your stay"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement(Line, {
    icon: "map-pin",
    label: q.location || 'Lakeland'
  }), /*#__PURE__*/React.createElement(Line, {
    icon: "calendar-days",
    label: `${q.arrival || '1 Sep 2026'} → ${q.departure || '29 Sep 2026'} · 4 weeks`
  }), /*#__PURE__*/React.createElement(Line, {
    icon: "bed-double",
    label: suite ? suite.name : 'No suite selected'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--border-subtle)',
      paddingTop: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, [['Suite · 4 weeks', base], extras.housekeeping && ['Housekeeping', house], extras.pet && ['Pet fee', pet], ['Refundable damage fee', damage]].filter(Boolean).map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, l), /*#__PURE__*/React.createElement("span", null, "$", v.toLocaleString()))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingTop: 8,
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-strong)'
    }
  }, "Due today"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-card-title)',
      fontSize: 'var(--fs-h2)',
      color: 'var(--text-strong)'
    }
  }, "$", (base + house + pet + damage).toLocaleString())), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)',
      color: 'var(--text-muted)'
    }
  }, "Taxes not included. Damage fee refunded on departure if no damage is found.")));
}
function Line({
  icon,
  label
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 15,
    style: {
      color: 'var(--sky-600)'
    }
  }), label);
}
function BookingFlow() {
  const [step, setStep] = React.useState(0);
  const [q, setQ] = React.useState({
    location: 'Lakeland',
    arrival: '2026-09-01',
    departure: '2026-09-29'
  });
  const [suite, setSuite] = React.useState(null);
  const [extras, setExtras] = React.useState({
    housekeeping: false,
    pet: true
  });
  const [rate, setRate] = React.useState('weekly');
  const [toast, setToast] = React.useState(false);
  return /*#__PURE__*/React.createElement(Shell, {
    step: step
  }, step === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-6)',
      maxWidth: 900,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Book direct",
    title: "Find your suite",
    body: "Stay a night, a week, a month or longer. No credit check, no long-term commitment.",
    align: "center",
    style: {
      margin: '0 auto'
    }
  }), /*#__PURE__*/React.createElement(BookingBar, {
    locations: ['Jacksonville North', 'Jacksonville West', 'Lakeland', 'Orlando', 'Kissimmee East', 'Kissimmee West', 'St. Augustine', 'Davenport'],
    value: q,
    onChange: setQ,
    onSearch: () => setStep(1)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      justifyContent: 'center',
      flexWrap: 'wrap'
    }
  }, ['Pet friendly', 'Pool', 'Meeting space', 'Fitness center', 'Near attractions'].map(t => /*#__PURE__*/React.createElement(Tag, {
    key: t
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'var(--space-5)',
      marginTop: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "wifi",
    label: "Free Wi-Fi"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "waves",
    label: "Swimming Pool"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "washing-machine",
    label: "On-site Laundry"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "dog",
    label: "Pet Friendly",
    note: "Additional fee"
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: 'var(--space-6)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, step === 1 ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-section-title)',
      color: 'var(--text-strong)'
    }
  }, "Suites in ", q.location), /*#__PURE__*/React.createElement(Tabs, {
    variant: "pill",
    items: [{
      value: 'weekly',
      label: 'Weekly'
    }, {
      value: 'monthly',
      label: 'Monthly'
    }],
    value: rate,
    onChange: setRate,
    style: {
      marginLeft: 'auto'
    }
  })), RESULTS.map(r => {
    const on = suite && suite.name === r.name;
    return /*#__PURE__*/React.createElement(Card, {
      key: r.name,
      padded: false,
      style: {
        padding: 'var(--space-4)',
        display: 'grid',
        gridTemplateColumns: '220px 1fr auto',
        gap: 'var(--space-5)',
        alignItems: 'center',
        border: on ? '2px solid var(--navy-800)' : '1px solid var(--border-subtle)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        aspectRatio: '16/10',
        borderRadius: 'var(--radius-image)',
        background: 'linear-gradient(135deg,var(--sky-100),var(--navy-100))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: 'var(--type-eyebrow)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--ls-eyebrow)',
        color: 'var(--navy-300)'
      }
    }, r.name), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        margin: 0,
        font: 'var(--type-card-title)',
        color: 'var(--text-strong)'
      }
    }, r.name), r.left <= 2 ? /*#__PURE__*/React.createElement(Badge, {
      tone: "warning"
    }, "Only ", r.left, " left") : /*#__PURE__*/React.createElement(Badge, {
      tone: "success"
    }, "Available")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'var(--space-5)',
        font: 'var(--type-body)',
        fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-muted)'
      }
    }, /*#__PURE__*/React.createElement(Line, {
      icon: "users",
      label: r.sleeps
    }), /*#__PURE__*/React.createElement(Line, {
      icon: "ruler",
      label: r.size
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, r.feat.map(x => /*#__PURE__*/React.createElement(Tag, {
      key: x
    }, x)))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-end',
        paddingRight: 'var(--space-3)'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--type-card-title)',
        fontSize: 'var(--fs-h2)',
        color: 'var(--text-strong)'
      }
    }, "$", rate === 'weekly' ? r.week : Math.round(r.week * 3.5)), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--type-body)',
        fontSize: 'var(--fs-caption)',
        color: 'var(--text-muted)'
      }
    }, "per ", rate === 'weekly' ? 'week' : 'month')), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: on ? 'accent' : 'primary',
      onClick: () => {
        setSuite(r);
        setStep(2);
      }
    }, on ? 'Selected' : 'Select')));
  })) : step === 2 ? /*#__PURE__*/React.createElement(Card, {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-section-title)',
      fontSize: 'var(--fs-h2)',
      color: 'var(--text-strong)'
    }
  }, "Guest details"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "First name",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Jordan"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Last name",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Reyes"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Email",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "mail",
    placeholder: "you@email.com"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Mobile",
    required: true,
    hint: "For move-in instructions."
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "phone",
    placeholder: "(863) 555-0140"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Guests"
  }, /*#__PURE__*/React.createElement(Select, {
    options: ['1 guest', '2 guests', '3 guests', '4 guests'],
    placeholder: "2 guests"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Arrival window"
  }, /*#__PURE__*/React.createElement(Select, {
    options: ['4:00–6:00 PM', '6:00–9:00 PM', '9:00 PM–2:30 AM'],
    placeholder: "4:00\u20136:00 PM"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--border-subtle)',
      paddingTop: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-strong)'
    }
  }, "Add-ons"), /*#__PURE__*/React.createElement(Switch, {
    checked: extras.housekeeping,
    onChange: v => setExtras({
      ...extras,
      housekeeping: v
    }),
    label: "Weekly housekeeping \u2014 $45/week"
  }), /*#__PURE__*/React.createElement(Checkbox, {
    checked: extras.pet,
    onChange: v => setExtras({
      ...extras,
      pet: v
    }),
    label: "I'm bringing a pet \u2014 $120 one-time fee"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(Radio, {
    checked: rate === 'weekly',
    onChange: () => setRate('weekly'),
    label: "Pay weekly in advance"
  }), /*#__PURE__*/React.createElement(Radio, {
    checked: rate === 'monthly',
    onChange: () => setRate('monthly'),
    label: "Pay monthly \u2014 save more"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: "arrow-left",
    onClick: () => setStep(1)
  }, "Back"), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    iconRight: "arrow-right",
    onClick: () => {
      setStep(3);
      setToast(true);
    }
  }, "Review & Pay"))) : /*#__PURE__*/React.createElement(Card, {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--status-success-soft)',
      color: 'var(--status-success)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "circle-check",
    size: 30
  })), /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Booking confirmed",
    title: "You're all set, Jordan",
    body: `We've emailed your move-in instructions for ${q.location}. The front office is open 4:00–6:00 PM daily and move-in runs until 2:30 AM.`
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, "Confirmation #SB-408217"), /*#__PURE__*/React.createElement(Badge, null, "Pet friendly"), /*#__PURE__*/React.createElement(Badge, null, "4 weeks")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    iconLeft: "download"
  }, "Save Receipt"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: () => {
      setStep(0);
      setSuite(null);
    }
  }, "Book Another Stay")), toast ? /*#__PURE__*/React.createElement(Toast, {
    tone: "success",
    title: "Confirmation sent",
    onClose: () => setToast(false)
  }, "Check your inbox for the move-in code.") : null)), /*#__PURE__*/React.createElement(Summary, {
    q: q,
    suite: suite || RESULTS[0],
    extras: extras
  })));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(BookingFlow, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/booking/BookingFlow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/App.jsx
try { (() => {
const {
  Dialog,
  Button,
  Logo
} = window.StayableDesignSystem_11a9a8;
function App() {
  const [page, setPage] = React.useState('Home');
  const [query, setQuery] = React.useState({});
  const [dialog, setDialog] = React.useState(false);
  const go = p => {
    setPage(['Home', 'Offers', 'Get in Touch'].includes(p) ? p : p === 'Locations' || p === 'Step Inside' || p === 'Location' ? 'Location' : 'Home');
    window.scrollTo(0, 0);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      minHeight: '100vh',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(SiteHeader, {
    page: page,
    onNavigate: go,
    onBook: () => setDialog(true)
  }), page === 'Home' ? /*#__PURE__*/React.createElement(HomePage, {
    onNavigate: go,
    query: query,
    setQuery: setQuery,
    onSearch: () => setDialog(true)
  }) : page === 'Location' ? /*#__PURE__*/React.createElement(LocationPage, {
    onNavigate: go,
    onBook: () => setDialog(true)
  }) : page === 'Offers' ? /*#__PURE__*/React.createElement(OffersPage, {
    onNavigate: go
  }) : /*#__PURE__*/React.createElement(ContactPage, null), /*#__PURE__*/React.createElement(SiteFooter, {
    onNavigate: go
  }), /*#__PURE__*/React.createElement(Dialog, {
    open: dialog,
    onClose: () => setDialog(false),
    title: "Sign a Lease",
    subtitle: "Which property are you interested in? Pick a location to start your application.",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: () => setDialog(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      iconRight: "arrow-right",
      onClick: () => setDialog(false)
    }, "Continue")),
    style: {
      position: 'fixed'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--space-2)'
    }
  }, window.LOCATIONS.map(l => /*#__PURE__*/React.createElement(Button, {
    key: l,
    size: "sm",
    variant: "secondary"
  }, l)))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/ContactPage.jsx
try { (() => {
const {
  Button,
  Card,
  SectionHeading,
  Icon,
  Input,
  Field,
  Select,
  Toast,
  Tooltip
} = window.StayableDesignSystem_11a9a8;
function ContactPage() {
  const [sent, setSent] = React.useState(false);
  return /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 420px',
      gap: 'var(--space-9)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Get in touch",
    title: "We're here every day",
    body: "Front office hours are 4:00\u20136:00 PM daily and by appointment, year-round. Move-in runs 4:00 PM to 2:30 AM."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-4)'
    }
  }, [['phone', 'Call a property', '(863) 555-0140'], ['mail', 'General enquiries', 'hello@rentstayable.com'], ['building-2', 'Purchasing', 'purchasing@rentstayable.com'], ['clock', 'Front office', '4:00 PM – 6:00 PM daily']].map(([i, l, v]) => /*#__PURE__*/React.createElement(Card, {
    key: l,
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-accent-soft)',
      color: 'var(--sky-700)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: i,
    size: 18
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-strong)'
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-muted)'
    }
  }, v))))), /*#__PURE__*/React.createElement(Photo, {
    label: "Front office / lobby photo",
    ratio: "21 / 9"
  })), /*#__PURE__*/React.createElement(Card, {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      boxShadow: 'var(--shadow-md)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      font: 'var(--type-card-title)',
      color: 'var(--text-strong)'
    }
  }, "Send us a note"), /*#__PURE__*/React.createElement(Field, {
    label: "Full name",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "user",
    placeholder: "Jordan Reyes"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Email",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "mail",
    placeholder: "you@email.com"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Location"
  }, /*#__PURE__*/React.createElement(Select, {
    options: window.LOCATIONS,
    placeholder: "Choose a Location"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "How can we help?",
    hint: "We reply within one business day."
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "I need a suite from 1 September\u2026"
  })), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    onClick: () => setSent(true)
  }, "Send Message"), sent ? /*#__PURE__*/React.createElement(Toast, {
    tone: "success",
    title: "Message sent",
    onClose: () => setSent(false)
  }, "Someone from the Lakeland front office will reply shortly.") : null)));
}
Object.assign(window, {
  ContactPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ContactPage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/HomePage.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  SectionHeading,
  PropertyCard,
  AmenityTile,
  BookingBar,
  Accordion,
  Badge,
  Icon,
  Card
} = window.StayableDesignSystem_11a9a8;
const PROPERTIES = [{
  name: 'Jacksonville West',
  region: 'North Florida',
  rate: 'From $319/week',
  blurb: 'Conveniently located near downtown, the airport, and the Prime F. Osborn III convention center.',
  tags: ['Meeting space', 'Free Wi-Fi']
}, {
  name: 'Lakeland',
  region: 'Central Florida',
  rate: 'From $329/week',
  blurb: "Off I-4, Exit 33 — easy access to both Tampa and Orlando, plus Lakeland's lakes, shopping and dining.",
  tags: ['Pool', 'Playground', 'BBQ area']
}, {
  name: 'Orlando',
  region: 'Central Florida',
  rate: 'From $339/week',
  blurb: 'Off U.S. Highway 441, less than a mile from the Florida Mall, with fully-equipped kitchens.',
  tags: ['Full kitchen', 'Free Wi-Fi']
}, {
  name: 'Kissimmee West',
  region: 'Central Florida',
  rate: 'From $349/week',
  blurb: 'Ten miles from the Orlando attractions — swimming pool, hot tub, kids pool and playground.',
  tags: ['Pet friendly', 'Hot tub', 'Cribs']
}, {
  name: 'St. Augustine',
  region: 'North Florida',
  rate: 'From $335/week',
  blurb: 'Historic St. Augustine, minutes from the ocean, with a fitness center and full-sized refrigerators.',
  tags: ['Fitness center']
}, {
  name: 'Davenport',
  region: 'Central Florida',
  rate: 'From $345/week',
  blurb: 'Minutes from Disney and ChampionsGate on US Highway 27 — ideal for families and long assignments.',
  tags: ['Pet friendly', 'Near parks']
}];
const FAQS = [{
  question: 'Do you offer discounts if I pay by the week or month?',
  answer: 'We offer discounted weekly and monthly rates at each location based on availability. Your stay must be fully paid in advance for the time you choose. See our Offers page for other promotions.'
}, {
  question: 'What are your office hours?',
  answer: 'Front office hours are 4:00 PM to 6:00 PM and by appointment every day of the week, year-round. Guests may move in between 4:00 PM and 2:30 AM.'
}, {
  question: 'Do you offer housekeeping service?',
  answer: 'All rooms are cleaned once prior to move-in, and every property offers housekeeping on request for a minimal fee — so your base rate stays lower and you only add what you need.'
}, {
  question: 'Are there any extra fees, like security deposits?',
  answer: 'We require a refundable damage fee per room, per stay at move-in, which varies by location and length of stay. It is refunded on departure if no damage is found.'
}, {
  question: 'Do you welcome pets in the hotel?',
  answer: 'Our communities warmly welcome pets. For the comfort of all guests and furry friends, an additional fee applies.'
}];
function Section({
  children,
  tone = 'page',
  style
}) {
  const bg = {
    page: 'var(--surface-page)',
    alt: 'var(--surface-page-alt)',
    warm: 'var(--surface-warm)',
    inverse: 'var(--surface-inverse)'
  }[tone];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: bg,
      padding: 'var(--section-y) 0',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--gutter-page-lg)'
    }
  }, children));
}
function HomePage({
  onNavigate,
  query,
  setQuery,
  onSearch
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      minHeight: 560,
      display: 'flex',
      alignItems: 'center',
      background: 'var(--navy-800)'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    dark: true,
    label: "Hero photo \u2014 bright suite interior, 21:9",
    ratio: "auto",
    radius: "0",
    style: {
      position: 'absolute',
      inset: 0,
      aspectRatio: 'auto'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scrim-hero)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--gutter-page-lg)',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      color: 'var(--sky-400)'
    }
  }, "Extended stay across Florida"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '12px 0 16px',
      font: 'var(--type-hero)',
      fontSize: 'var(--fs-display-xl)',
      color: 'var(--text-inverse)',
      letterSpacing: 'var(--ls-display)',
      maxWidth: 720,
      textWrap: 'pretty'
    }
  }, "Flexible. Affordable. Home."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 var(--space-7)',
      font: 'var(--type-body-lg)',
      color: 'var(--text-inverse-muted)',
      maxWidth: 540
    }
  }, "Clean, spacious suites for a night, a week, a month or longer. No long-term commitment, no credit check, one bill for the essentials."), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 940
    }
  }, /*#__PURE__*/React.createElement(BookingBar, {
    inverse: true,
    locations: window.LOCATIONS,
    value: query,
    onChange: setQuery,
    onSearch: onSearch
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--navy-700)',
      padding: 'var(--space-5) 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--gutter-page-lg)',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(AmenityTile, {
    inverse: true,
    icon: "wifi",
    label: "Free Wi-Fi",
    note: "Every suite"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    inverse: true,
    icon: "waves",
    label: "Swimming Pool",
    note: "Most locations"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    inverse: true,
    icon: "washing-machine",
    label: "On-site Laundry"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    inverse: true,
    icon: "dog",
    label: "Pet Friendly",
    note: "Additional fee"
  }))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 'var(--space-6)',
      marginBottom: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Eight Florida communities",
    title: "Explore Our Locations",
    body: "Near major highways, airports, attractions, business hubs and shopping."
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconRight: "arrow-right",
    onClick: () => onNavigate('Location')
  }, "All Locations")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'var(--space-5)'
    }
  }, PROPERTIES.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.name,
    style: {
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(PropertyCardWithPhoto, _extends({}, p, {
    onView: () => onNavigate('Location'),
    onBook: () => onNavigate('Offers')
  })))))), /*#__PURE__*/React.createElement(Section, {
    tone: "warm"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-9)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Welcome to Stayable",
    title: "Your affordable and flexible apartment home across Florida",
    body: "Clean, spacious suites. Affordable prices. Flexible options. The reasons to stay are endless. Whether you're staying a week, a month or longer, our apartment suites are designed to provide all of the comforts of home."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "refrigerator",
    label: "Full-size fridge"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "tv",
    label: "Flat-screen TV"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "utensils",
    label: "In-unit kitchenette"
  }), /*#__PURE__*/React.createElement(AmenityTile, {
    icon: "sparkles",
    label: "Housekeeping*",
    note: "Minimal fee"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: () => onNavigate('Offers')
  }, "See Current Offers"))), /*#__PURE__*/React.createElement(Photo, {
    label: "Suite interior \u2014 kitchenette and living area",
    ratio: "4 / 5"
  }))), /*#__PURE__*/React.createElement(Section, {
    tone: "inverse"
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    inverse: true,
    align: "center",
    eyebrow: "You have the freedom to",
    title: "Stay awhile\u2026",
    style: {
      margin: '0 auto var(--space-7)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'var(--space-5)'
    }
  }, [['Stay Flexible.', 'Easy booking, no long-term commitment, no credit check, and one bill for all the essentials lets you come and go on your time.'], ['Stay Fresh.', 'Our on-site laundry facilities make it easy for you to freshen up your wardrobe, anytime.'], ['Stay longer. Save more.', 'Staying with us for a week, month or longer? Save by paying for longer stays in advance.']].map(([t, b]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    dark: true,
    label: "Lifestyle photo",
    ratio: "3 / 2"
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      font: 'var(--type-card-title)',
      color: 'var(--text-inverse)'
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body)',
      color: 'var(--text-inverse-muted)'
    }
  }, b))))), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '380px 1fr',
      gap: 'var(--space-9)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Good to know",
    title: "Frequently Asked Questions",
    body: "Still have a question? Our front office is open every day, 4:00\u20136:00 PM and by appointment."
  }), /*#__PURE__*/React.createElement(Accordion, {
    items: FAQS,
    defaultOpen: 0
  }))), /*#__PURE__*/React.createElement(Section, {
    tone: "alt",
    style: {
      paddingTop: 0,
      paddingBottom: 'var(--space-10)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padded: false,
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    label: "Team photo \u2014 housekeeping and front office",
    ratio: "auto",
    radius: "0",
    style: {
      aspectRatio: 'auto',
      minHeight: 260
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-8)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Join the team",
    title: "Careers at Stayable",
    body: "Explore our available career opportunities and apply now."
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Button, {
    iconRight: "arrow-right"
  }, "Search Job Openings"))))));
}
function PropertyCardWithPhoto(props) {
  const {
    Badge,
    Button,
    Icon
  } = window.StayableDesignSystem_11a9a8;
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      border: '1px solid var(--border-subtle)',
      boxShadow: hover ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      transform: hover ? 'var(--lift-card)' : 'none',
      transition: 'var(--transition-card)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    label: props.name + ' — exterior / pool',
    ratio: "16 / 10",
    radius: "0"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scrim-image)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 14,
      left: 14
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "inverse"
  }, props.rate)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 18,
      bottom: 14,
      color: 'var(--white)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      opacity: .85
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 13
  }), props.region), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-card-title)',
      fontSize: 'var(--fs-h2)'
    }
  }, props.name))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      padding: 'var(--card-pad)',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body)',
      color: 'var(--text-body)',
      textWrap: 'pretty'
    }
  }, props.blurb), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--space-2)'
    }
  }, props.tags.map(t => /*#__PURE__*/React.createElement(Badge, {
    key: t,
    tone: "accent"
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: props.onBook
  }, "Book Now"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: props.onView
  }, "View Location"))));
}
Object.assign(window, {
  HomePage,
  Section,
  PROPERTIES,
  FAQS,
  PropertyCardWithPhoto
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/HomePage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/LocationPage.jsx
try { (() => {
const {
  Button,
  Badge,
  Tabs,
  Tag,
  AmenityTile,
  SectionHeading,
  Accordion,
  Card,
  Icon,
  IconButton
} = window.StayableDesignSystem_11a9a8;
function LocationPage({
  onNavigate,
  onBook
}) {
  const [tab, setTab] = React.useState('Suites');
  const suites = [{
    name: 'Studio Suite',
    sleeps: '1–2 guests',
    size: '325 sq ft',
    week: '$329',
    month: '$1,149',
    feat: ['Queen bed', 'Kitchenette', 'Full-size fridge']
  }, {
    name: 'One Bedroom Suite',
    sleeps: '1–4 guests',
    size: '480 sq ft',
    week: '$389',
    month: '$1,349',
    feat: ['Separate bedroom', 'Sofa bed', 'Full kitchen']
  }, {
    name: 'Two Bedroom Suite',
    sleeps: '2–6 guests',
    size: '620 sq ft',
    week: '$459',
    month: '$1,599',
    feat: ['Two bedrooms', 'Two TVs', 'Full kitchen']
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 420,
      background: 'var(--navy-800)'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    dark: true,
    label: "Property hero \u2014 exterior, 21:9",
    ratio: "auto",
    radius: "0",
    style: {
      position: 'absolute',
      inset: 0,
      aspectRatio: 'auto'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scrim-hero)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--gutter-page-lg) var(--space-8)',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "inverse"
  }, "Pet friendly"), /*#__PURE__*/React.createElement(Badge, {
    tone: "inverse"
  }, "Pool"), /*#__PURE__*/React.createElement(Badge, {
    tone: "inverse"
  }, "Playground")), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      font: 'var(--type-hero)',
      color: 'var(--text-inverse)',
      letterSpacing: 'var(--ls-display)'
    }
  }, "Stayable Lakeland"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      color: 'var(--text-inverse-muted)',
      font: 'var(--type-body)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 16
  }), "4315 Lakeland Park Drive, Lakeland, FL 33809 \xB7 Off I-4, Exit 33")))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--white)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 84,
      zIndex: 30
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '18px var(--gutter-page-lg) 0',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    items: ['Suites', 'Amenities', 'Location', 'Policies'],
    value: tab,
    onChange: setTab,
    style: {
      flex: 1,
      border: 'none'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    onClick: onBook,
    style: {
      marginBottom: 14
    }
  }, "Book Now"))), /*#__PURE__*/React.createElement(Section, null, tab === 'Suites' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Choose your space",
    title: "Suites at Lakeland",
    body: "Every suite is furnished and move-in ready. Weekly and monthly rates are paid in advance."
  }), suites.map(s => /*#__PURE__*/React.createElement(Card, {
    key: s.name,
    padded: false,
    style: {
      display: 'grid',
      gridTemplateColumns: '280px 1fr auto',
      gap: 'var(--space-6)',
      alignItems: 'center',
      padding: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    label: s.name,
    ratio: "16 / 10"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      font: 'var(--type-card-title)',
      color: 'var(--text-strong)'
    }
  }, s.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-5)',
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 15
  }), s.sleeps), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ruler",
    size: 15
  }), s.size)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, s.feat.map(x => /*#__PURE__*/React.createElement(Tag, {
    key: x
  }, x)))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      paddingRight: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-card-title)',
      fontSize: 'var(--fs-h2)',
      color: 'var(--text-strong)'
    }
  }, s.week), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)',
      color: 'var(--text-muted)'
    }
  }, "per week \xB7 ", s.month, "/month")), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: onBook
  }, "Book Now"))))) : tab === 'Amenities' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'var(--space-6)'
    }
  }, [['wifi', 'Free Wi-Fi'], ['waves', 'Swimming Pool'], ['washing-machine', 'On-site Laundry'], ['dog', 'Pet Friendly', 'Additional fee'], ['refrigerator', 'Full-size Refrigerator'], ['tv', 'Flat-screen TV'], ['baby', 'Cribs Available'], ['flame', 'BBQ Area'], ['sparkles', 'Housekeeping', 'Minimal fee'], ['car-front', 'Free Parking'], ['dumbbell', 'Fitness Center'], ['key-round', 'Flexible Move-in']].map(([i, l, n]) => /*#__PURE__*/React.createElement(AmenityTile, {
    key: l,
    icon: i,
    label: l,
    note: n
  }))) : tab === 'Location' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      gap: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    label: "Map \u2014 4315 Lakeland Park Drive",
    ratio: "16 / 9"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Getting here",
    title: "Centrally located",
    body: "Off exit 33 of I-4, halfway between Tampa and Orlando."
  }), [['plane', 'Tampa International', '38 min'], ['plane', 'Orlando International', '52 min'], ['shopping-bag', 'Lakeland Square Mall', '6 min'], ['trees', 'Lake Parker Park', '9 min']].map(([i, l, t]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      paddingBottom: 'var(--space-3)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: i,
    size: 18,
    style: {
      color: 'var(--sky-600)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: 'var(--type-body)',
      color: 'var(--text-body)'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-label)',
      color: 'var(--text-muted)'
    }
  }, t))))) : /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-narrow)'
    }
  }, /*#__PURE__*/React.createElement(Accordion, {
    defaultOpen: 0,
    items: window.FAQS
  }))));
}
Object.assign(window, {
  LocationPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/LocationPage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/OffersPage.jsx
try { (() => {
const {
  Button,
  Badge,
  Card,
  SectionHeading,
  Icon,
  Input,
  Field,
  Checkbox,
  Select,
  Tag
} = window.StayableDesignSystem_11a9a8;
const OFFERS = [{
  tag: 'Stay longer',
  title: 'Fourth week free',
  body: 'Book three weeks in advance at any Central Florida community and your fourth week is on us.',
  ends: 'Ends 30 Sep 2026'
}, {
  tag: 'New guests',
  title: '$99 first night',
  body: 'Try a suite for a night before you commit to a longer stay. One per household.',
  ends: 'Ongoing'
}, {
  tag: 'Pets',
  title: 'Waived pet fee',
  body: 'Monthly bookings at Kissimmee West and Davenport include the pet fee at no charge.',
  ends: 'Ends 31 Dec 2026'
}];
function OffersPage({
  onNavigate
}) {
  const [subscribed, setSubscribed] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Section, {
    tone: "alt"
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Current promotions",
    title: "Offers",
    body: "Discounted weekly and monthly rates are available at every location. These deals stack on top."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'var(--space-5)',
      marginTop: 'var(--space-7)'
    }
  }, OFFERS.map(o => /*#__PURE__*/React.createElement(Card, {
    key: o.title,
    padded: false,
    interactive: true,
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Photo, {
    label: "Offer image",
    ratio: "16 / 9",
    radius: "0"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--card-pad)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, o.tag), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      font: 'var(--type-card-title)',
      color: 'var(--text-strong)'
    }
  }, o.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body)',
      color: 'var(--text-body)'
    }
  }, o.body), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 'auto',
      paddingTop: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)',
      color: 'var(--text-muted)'
    }
  }, o.ends), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => onNavigate('Home')
  }, "Book"))))))), /*#__PURE__*/React.createElement(Section, {
    tone: "inverse"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 420px',
      gap: 'var(--space-9)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    inverse: true,
    eyebrow: "Stay in the loop",
    title: "Get exclusive deals just for you",
    body: "Subscribe to our newsletter and be the first to know about special promotions \u2014 plus stay up to date with all things Stayable."
  }), /*#__PURE__*/React.createElement(Card, {
    tone: "inverse",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      background: 'rgba(255,255,255,.06)'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-inverse)'
      }
    }, "Email address")
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "mail",
    placeholder: "you@email.com"
  })), /*#__PURE__*/React.createElement(Field, {
    label: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-inverse)'
      }
    }, "Preferred location")
  }, /*#__PURE__*/React.createElement(Select, {
    options: window.LOCATIONS,
    placeholder: "Choose a Location"
  })), /*#__PURE__*/React.createElement(Checkbox, {
    checked: subscribed,
    onChange: setSubscribed,
    label: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-inverse-muted)'
      }
    }, "Send me offers for nearby communities too")
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    fullWidth: true,
    iconRight: "arrow-right"
  }, "Continue")))));
}
Object.assign(window, {
  OffersPage,
  OFFERS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/OffersPage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Photo.jsx
try { (() => {
/* Photo placeholder. No brand photography was supplied with the source material and
   rentstayable.com images cannot be hot-linked from this environment, so screens use
   labelled slots. Swap for real <img> tags — bright, real rooms; see readme VISUAL FOUNDATIONS. */
function Photo({
  label = 'Photo',
  ratio = '16 / 10',
  radius = 'var(--radius-image)',
  dark = false,
  style,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: ratio,
      borderRadius: radius,
      overflow: 'hidden',
      background: dark ? 'linear-gradient(135deg, var(--navy-700), var(--navy-800) 60%, var(--navy-600))' : 'linear-gradient(135deg, var(--sky-100), var(--navy-100))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      color: dark ? 'rgba(255,255,255,.34)' : 'var(--navy-300)',
      textAlign: 'center',
      padding: '0 12px'
    }
  }, label), children);
}
Object.assign(window, {
  Photo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Photo.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteChrome.jsx
try { (() => {
const {
  Logo,
  Button,
  Icon,
  IconButton
} = window.StayableDesignSystem_11a9a8;
const NAV = ['Home', 'Locations', 'Step Inside', 'Offers', 'Get in Touch', 'Blogs'];
function SiteHeader({
  page,
  onNavigate,
  onBook
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      background: 'var(--navy-800)',
      borderBottom: '1px solid var(--border-inverse)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--gutter-page-lg)',
      height: 84,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('Home');
    },
    style: {
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "light",
    height: 38,
    basePath: "../../"
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 'var(--space-6)',
      marginLeft: 'auto'
    }
  }, NAV.map(n => /*#__PURE__*/React.createElement("a", {
    key: n,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate(n);
    },
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-eyebrow)',
      textDecoration: 'none',
      paddingBottom: 3,
      color: page === n ? 'var(--sky-400)' : 'var(--text-inverse)',
      borderBottom: page === n ? '2px solid var(--sky-400)' : '2px solid transparent'
    }
  }, n, n === 'Locations' ? ' ▾' : ''))), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    size: "sm",
    onClick: onBook
  }, "Book Now")));
}
const LOCATIONS = ['Jacksonville North', 'Jacksonville West', 'Lakeland', 'Orlando', 'Kissimmee East', 'Kissimmee West', 'St. Augustine', 'Davenport'];
function SiteFooter({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--navy-900)',
      color: 'var(--text-inverse-muted)',
      padding: 'var(--space-9) 0 var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--gutter-page-lg)',
      display: 'grid',
      gridTemplateColumns: '1.2fr 1fr 1fr 1fr',
      gap: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "light",
    height: 36,
    basePath: "../../"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      maxWidth: 260
    }
  }, "Affordable furnished apartments across Florida \u2014 no credit check, pet-friendly, flexible weekly and monthly stays."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-2)'
    }
  }, ['linkedin', 'facebook', 'instagram'].map(s => /*#__PURE__*/React.createElement(IconButton, {
    key: s,
    icon: s,
    label: s,
    size: "sm",
    variant: "inverse"
  })))), [['Locations', LOCATIONS], ['Quick Links', ['Offers', 'FAQ', 'Careers', 'Contact', 'Blogs', 'Rules & Regulations']], ['Deposit', ['Deposit Terms & Conditions', 'Terms & Conditions', 'Privacy Policy']]].map(([title, items]) => /*#__PURE__*/React.createElement("div", {
    key: title,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      font: 'var(--type-label)',
      color: 'var(--text-inverse)'
    }
  }, title), items.map(i => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate('Location');
    },
    style: {
      font: 'var(--type-body)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-inverse-muted)',
      textDecoration: 'none'
    }
  }, i))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: 'var(--space-6) var(--gutter-page-lg) 0',
      marginTop: 'var(--space-6)',
      borderTop: '1px solid var(--border-inverse)',
      font: 'var(--type-body)',
      fontSize: 'var(--fs-caption)'
    }
  }, "\xA92026 Stayable. All Rights Reserved."));
}
Object.assign(window, {
  SiteHeader,
  SiteFooter,
  LOCATIONS,
  NAV
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteChrome.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.DateField = __ds_scope.DateField;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.AmenityTile = __ds_scope.AmenityTile;

__ds_ns.BookingBar = __ds_scope.BookingBar;

__ds_ns.PropertyCard = __ds_scope.PropertyCard;

__ds_ns.SectionHeading = __ds_scope.SectionHeading;

__ds_ns.Accordion = __ds_scope.Accordion;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
