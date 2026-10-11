const EASE_IN = /\bease-in(?!-)/;

/** The good-css and DESIGN.md rules a linter can check. */
export default {
  extends: ['stylelint-config-recommended'],
  plugins: ['./scripts/stylelint-hover-media.js'],
  rules: {
    // Flags source order where specificity, not order, decides the winner; with
    // per-component files and nesting nearly every hit is a false positive.
    'no-descending-specificity': null,
    'goldfin/hover-in-hover-media': true,
    'property-disallowed-list': [
      [
        /^(top|right|bottom|left)$/,
        /^(margin|padding)-(top|right|bottom|left)$/,
        /^border-(top|right|bottom|left)(-|$)/,
      ],
      { message: (property) => `Use the logical (inline / block) form of "${property}"` },
    ],
    'declaration-property-value-disallowed-list': [
      {
        '/^overflow/': ['hidden'],
        outline: ['none'],
        'text-align': ['left', 'right'],
        float: ['left', 'right'],
        transition: [/\ball\b/, EASE_IN],
        'transition-property': ['all'],
        'transition-timing-function': [EASE_IN],
        animation: [EASE_IN],
        'animation-timing-function': [EASE_IN],
      },
      { message: (property, value) => `"${property}: ${value}" is banned by good-css / DESIGN.md` },
    ],
  },
};
