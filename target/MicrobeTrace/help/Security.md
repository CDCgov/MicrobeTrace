MicrobeTrace is a serverless web application designed specifically for analysis of PII or potentially-PII data. MicrobeTrace is safe for your data, and we can prove it!

## Proving PII-safety

MicrobeTrace is safe for PII data because it performs all analysis on the computer sitting in front of you. Your data is never sent back across the 'net to a server. If you want to see this for yourself, try this experiment:

1. Open [MicrobeTrace](https://microbetrace.cdc.gov/MicrobeTrace/) in a web browser.
2. Turn off your WiFi or disconnect your ethernet connection.
3. Open a new tab and go to any website to see if it loads.
4. Now that you're certain there's no internet connection, go back to your MicrobeTrace tab and load some data. You can even refresh the page and it should still load correctly.
5. MicrobeTrace will process that data completely normally, and output your visualizations.

If you need further verification, this experiment can be re-run in a [Faraday cage](https://en.wikipedia.org/wiki/Faraday_cage). Seriously!

## How MicrobeTrace is PII-Safe

The trick to making MicrobeTrace safe for PII is simple: _never send data anywhere_. MicrobeTrace uses the processor and memory of the computer sitting in front of you to perform its analysis and visualization.

## But what about...

If you search for MicrobeTrace on Google, you won't have to look far before you find a ton of results seemingly documenting security vulnerabilities. Doesn't this mean MicrobeTrace is insecure?

Well, no; That's not how that works. For some context, here's what really happened: In early 2018, the IT department for the State of Kentucky was considering clearing MicrobeTrace (which at that time was a *desktop application*) for use on their computer systems. They hired a reputable security professional to perform an audit of MicrobeTrace. In the course of his audit, [he discovered](https://github.com/wshepherd0010/advisories/blob/master/CVE-2018-8974.md) a way that an attacker could gain access to a computer running MicrobeTrace by including some bad data in a dataset that the user would attempt to analyze using MicrobeTrace.

(In case you're interested in the specifics of the exploit, it was an XSS attack by [inserting a script tag into a CSV file](https://github.com/CDCgov/MicrobeTrace/blob/master/test/adversarial/linksFieldnameInjection.csv)).

We resolved that specific bug as quickly as possible, but failed to do so perfectly. In assessing our solution, the auditor discovered [another similar way](https://github.com/wshepherd0010/advisories/blob/master/CVE-2018-9113.md) to compromise the data. Following this, we changed tactics and protected MicrobeTrace against the entire class of exploits. MicrobeTrace is safe from this sort of attack, and has been in every release since.

## But all those search results!

...Are just thousands of vulnerability scrapers reporting the same two advisories, over and over again.

## Additional Security Measures

Since then, MicrobeTrace has become substantially more secure. The largest change that enables this claim is MicrobeTrace's architectural transition from a Desktop application to a web application. Instead of running as a program (like Microsoft Excel), MicrobeTrace now runs as a website (like Google Sheets). This severely curtails an attacker's ability to threaten your system, even if MicrobeTrace were compromised. For example, MicrobeTrace can load any files you tell it to, but it cannot look at any files you do not tell it to, whereas a desktop application can read most files on your hard drive. Also, browser rules dictate that MicrobeTrace can only save files to your `Downloads/` directory, whereas desktop applications can save files anywhere on your hard drive. These are just two examples of the ways web browsers protect their users, but there are literally thousands more measures in place. In transitioning to the web, MicrobeTrace inherits those protective measures. 