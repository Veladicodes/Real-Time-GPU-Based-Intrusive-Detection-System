const stylelint = require("stylelint")

const ruleName = "tailwindcss/no-custom-classname"

const plugin = stylelint.createPlugin(ruleName, () => {
  return () => {}
})

plugin.ruleName = ruleName
plugin.messages = stylelint.utils.ruleMessages(ruleName, {})

module.exports = plugin
