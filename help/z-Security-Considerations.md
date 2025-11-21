MicrobeTrace has adopted a [very secure architecture](https://github.com/CDCgov/MicrobeTrace/wiki/Security),
but that doesn't mean that development can neglect security concerns. There is
one publicly-disclosed MicrobeTrace threat vector. The relevant CVEs are:

* https://nvd.nist.gov/vuln/detail/CVE-2018-8974
* https://nvd.nist.gov/vuln/detail/CVE-2018-9113

As noted in the reports, **these holes were patched before the reports were made
public**. There is no evidence that they were ever maliciously exploited.

Since then, MicrobeTrace has transitioned from a Desktop-based application to a
Browser-based application. This has reduced the scope of the vulnerability from
executing arbitrary system-level code to executing arbitrary code within the
browser. In other words, attackers have a lot less opportunity to cause damage.
One way in which they still can, however, is in the disclosure of data as it is
being analyzed in MicrobeTrace.

While the specific security holes were patched, it is still possible that there
exists a weak point in the application where a clever and determined attacker can
inject a script tag that somehow gets pushed into the DOM, sources a foreign
script, and sends the data the user is analyzing somewhere else on the internet.

To prevent this, please ensure that every user input (but especially stuff that
could end up in the DOM) gets run through [`XSS`](https://www.npmjs.com/package/xss)
as soon as its ingested (and before it gets placed in the session).