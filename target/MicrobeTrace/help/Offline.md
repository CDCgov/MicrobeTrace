MicrobeTrace works _offline_ in two complementary senses of the term:
1. MicrobeTrace never sends data to a server. Instead, it performs all of its computations on your computer. (For more on this, see [Security](https://github.com/CDCgov/MicrobeTrace/wiki/Security).)
2. MicrobeTrace can run without internet access.

MicrobeTrace employs browser-based caching technology to make it available offline to users who've used it before. To make use of this feature, simply [launch the MicrobeTrace App](https://microbetrace.cdc.gov/MicrobeTrace/). To prove that it is working, disconnect your computer from the internet (check it by going to an arbitrary website and confirming that it doesn't load) and [launch the MicrobeTrace App](https://microbetrace.cdc.gov/MicrobeTrace/). MicrobeTrace will run entirely without internet access.

## The Secret Sauce: Cacheing
MicrobeTrace leverages serviceworkers to manage your browser's cache. This means that there's a tiny program in your browser that _acts like a server_, but is all on your machine. When that program hears you request data from the internet, it checks to see if it has a copy. If it does, it sends you that copy instead of the one from the internet. This happens really, really quickly. The one downside is, sometimes the copy on the internet gets updated, but the serviceworker doesn't get the memo. If that happens and you need the new version...

## Clearing the cache
If you want to be absolutely certain that you are working with the latest available version of MicrobeTrace, then you can [clear your browser cache](https://www.digitaltrends.com/computing/how-to-clear-your-browser-cache/) and [launch MicrobeTrace](https://microbetrace.cdc.gov/MicrobeTrace/) to download a fresh copy from the server.

Please note that in general this is unlikely to present any advantage over allowing MicrobeTrace to update itself automatically.