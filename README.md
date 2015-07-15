
# Lillicon

Lillicon is an experimental design tool to help create/edit scale variations of sets of icons (in vector format--SVG).  It was developed by Gilbert Bernstein and Wil Li as part of a research project.  The project page can be found here: http://www.gilbertbernstein.com/project_lillicon.html


## Installation

Lillicon runs entirely in the browser, so no installation is necessary.  Just open up `index.html` to start.

### Notes for Development

- Lillicon was developed on Firefox and uses a few ECMAScript6/Harmony features.  If this appears to be a problem, you may want to try using the polyfill file `js/setpolyfill`.

- Some dependencies were obtained via Bower, a package manager for client-side Javascript code.  We've left the `bower.json` file around in case you would like to mess with this directly, but also included the `bower_components` directory under source control so that everything will work out of the box for developers who dont' want to mess with this.

- This project includes a copy of Jonathan Shewchuk's Triangle library, compiled via emscripten.  If you would like to try to reproduce this cross-compilation, we've included a Makefile.  However, no attempt has been made to ensure this Makefile will work out of the box on different systems.  Think of it more as a transcript of what we did.

## License

Lillicon is made available under the open source Apache 2.0 license.  However, Jonathan Shewchuk's Triangle library retains its own license terms.  In particular, you will need to contact and receive permission from Jonathan Shewchuk to use Triangle in commercial code.  Please see his license for more details.  Feel free to copy gilbert@gilbertbernstein.com on any licensing correspondence you direct towards Jonathan.

### Demo Icons

A number of icons have been included to demonstrate the tool.  They were obtained from flaticon.com.  They are licensed under creative commons, CC-BY 3.0 Freepik.

## Communication

You can post questions and comments here, or send them to gilbert@gilbertbernstein.com




