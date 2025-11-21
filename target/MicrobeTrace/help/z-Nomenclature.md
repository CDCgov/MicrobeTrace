**Please note that this page is for developers and likely does not contain any information relevant to users of MicrobeTrace.**

In general, MicrobeTrace tries to adhere to the following style guide:

* everything should have context-revealing names.

### In HTML

MicrobeTrace uses [Bootstrap](https://getbootstrap.com/docs/4.1/getting-started/introduction/) for most layouts and elements, so the majority of classes and names come from that. However, we also want to use names that are broadly consistent with Bootstrap's style so:

* `id`s and `class`es should be all-lower-case, hyphen-delimited (i.e. [kebab case](https://lodash.com/docs#kebabCase))

### In Javascript

* `function`s and `var`iables (either globally- or locally- scoped) will be [camelCase](https://lodash.com/docs#camelCase)
* `Object` keys should also be camelCase, unless the keys map directly to some HTML or CSS element (see, for example, `session.style.widgets`)
* `event`s (that are unique to MicrobeTrace) should be kebab-case