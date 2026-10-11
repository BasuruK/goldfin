import stylelint from 'stylelint';

const { createPlugin, utils: { report, ruleMessages } } = stylelint;

const ruleName = 'goldfin/hover-in-hover-media';
const messages = ruleMessages(ruleName, {
  rejected: 'Put :hover inside @media (hover: hover) and (pointer: fine), so a tap does not leave it stuck',
});
const HOVER_MEDIA = /\(\s*hover:\s*hover\s*\)\s*and\s*\(\s*pointer:\s*fine\s*\)/;

function isInsideHoverMedia(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media' && HOVER_MEDIA.test(parent.params)) return true;
  }
  return false;
}

const rule = (enabled) => (root, result) => {
  if (!enabled) return;

  root.walkRules((node) => {
    if (!node.selector.includes(':hover') || isInsideHoverMedia(node)) return;
    report({ result, ruleName, message: messages.rejected, node, word: ':hover' });
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

export default createPlugin(ruleName, rule);
