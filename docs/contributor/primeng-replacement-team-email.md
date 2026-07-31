# Email draft: MicrobeTrace Angular 22 and PrimeNG decision

**Subject:** MicrobeTrace Angular 22: PrimeNG license and alternatives assessment

Hi team,

I attached the updated PrimeNG 22 decision assessment. It incorporates PrimeTek's response, the CDC discussion about open-source classification and partner impact, the available alternatives, and an AI-assisted migration estimate.

The short version is:

- PrimeTek confirmed that it does not offer an open-source grant. CDC would need commercial PrimeUI coverage for PrimeNG 22.
- The commercial terms allow finished MicrobeTrace applications to be distributed to unlimited users without runtime fees, and CI/build servers do not need seats. Partners who only use MicrobeTrace or integrate with its outputs are therefore unlikely to be directly affected.
- The larger concern is the development and contribution model. CDC-authored code can remain Apache 2.0, but the complete PrimeNG 22-based application would be mixed-source and would not be freely buildable or modifiable under Apache terms alone. Developers and external contributors working with the PrimeUI-based code would need appropriate licensed coverage.
- Staying with PrimeNG has the lowest immediate technical effort, but it introduces recurring procurement, contributor, and future-upgrade risk. NG-ZORRO remains the closest open-source replacement.
- Using GPT-5.6 Sol and the existing automated tests, the likely NG-ZORRO migration estimate is 16-32 agent-active hours over 1-3 calendar days, plus approximately 2-6 hours of human review. The estimate is intentionally based on agent execution rather than traditional person-days.

My recommendation is to proceed on two tracks: obtain the PrimeUI quote and written clarifications so that option remains available, while using the replacement branch to run a 2-4 hour NG-ZORRO checkpoint against the hardest table, dialog, TreeSelect, and reorder behaviors. If that checkpoint succeeds, we can continue the open-source replacement. If the Angular 22 schedule is tighter, we can use PrimeNG 22 as a documented mixed-source bridge and set a future reassessment date.

The main program decisions are whether the release timeline allows the short migration attempt, whether we are comfortable with a mixed-source classification, how many developer seats would be required, and what written terms PrimeTek will provide for public builds, forks, and external contributions.

Please review the attached assessment and let me know which path you prefer. Once we agree, I can either continue the replacement work or support the licensing/procurement steps and repository documentation needed for PrimeNG 22.

Thanks,

Evan
