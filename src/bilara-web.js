(function(exports) {
    const { logger } = require('log-instance');
    const { MerkleJson } = require('merkle-json');
    const examples = require('../api/examples.json');
    const suidMap = require('../api/suid-map-bilara-data.json');

    class BilaraWeb {
        constructor(opts={}) {
            (opts.logger || logger).logInstance(this, opts);
            this.examples = opts.examples || examples;
            this.suidMap = opts.suidMap || suidMap;
            this.lang = opts.lang || 'en';
            this.mj = new MerkleJson;
            this.maxResults = opts.maxResults==null ? 1000 : opts.maxResults;
            this.axios = opts.axios;
            this.host = opts.host || 'https://raw.githubusercontent.com';
            this.includeUnpublished = opts.includeUnpublished === true;
            this.suttaCache = {};
            let matchHighlight = this.matchHighlight = opts.matchHighlight ||
                '<span class="scv-matched">$&</span>';
            this.highlightMatch = opts.highlightMatch || (match=>
                matchHighlight.replace('$&', match)||match);
        }

        static sanitizePattern(pattern) {
            if (!pattern) {
                throw new Error("search pattern is required");
            }
            const MAX_PATTERN = 1024;
            var excess = pattern.length - MAX_PATTERN;
            if (excess > 0) {
                throw new Error(
                    `Search text too long by ${excess} characters.`);
            }
            // replace quotes (code injection on grep argument)
            pattern = pattern.replace(/["']/g,'.'); 
            // eliminate tabs, newlines and carriage returns
            pattern = pattern.replace(/\s/g,' '); 
            // remove control characters
            pattern = pattern.replace(/[\u0000-\u001f\u007f]+/g,''); 
            // must be valid
            new RegExp(pattern);

            return pattern;
        }


        static normalizePattern(pattern) {
            // normalize white space to space
            pattern = pattern.trim().replace(/[\s]+/g,' ').toLowerCase(); 
            
            return pattern;
        }

        get reExample() {
            var reExample = this._reExample;
            if (!reExample) {
                let examples = this.examples;
                reExample = Object.keys(examples).reduce((a,lang)=>{
                    let pat = examples[lang].join('|\\b');
                    a[lang] = new RegExp(`\\b${pat}`, "gimu");
                    return a;
                },{});
                Object.defineProperty(this, "_reExample", reExample);
            }
            return reExample;
        }

        get reIsExample() {
            var reIsExample = this._reIsExample;
            if (!reIsExample) {
                let examples = this.examples;
                reIsExample = Object.keys(examples).reduce((a,lang)=>{
                    let pat = examples[lang].join('|');
                    a[lang] = new RegExp(`(\\b)?\(${pat}\)(\\b)?`, "iu");
                    return a;
                },{});
                Object.defineProperty(this, "_reIsExample", reIsExample);
            }
            return reIsExample;
        }

        isExample(pattern, lang=this.lang) {
            let reEx = this.reIsExample[lang];
            return reEx && reEx.test(pattern);
        }

        exampleOfMatch(match, lang='en') {
            let exLang = this.examples[lang] || [];
            return exLang.find(ex=>{
                let re = new RegExp(ex, "mui");
                return re.test(match);
            });
        }

        exampleGuid(example, lang='en') {
            const fbody = [
                `(args)=>{`,
                `                return that.slowFind.call(that, args);`,
                `            }`,
            ].join('\n');
            let { includeUnpublished } = this;
            let key = {
              volume: "Seeker.callSlowFind",
              fbody,
              args: [{
                  pattern: example,
                  languages: lang === 'en'
                    ? [ "pli", "en", ]
                    : [ "pli", "en", lang ],
                  searchLang: lang,
                  lang,

                  showMatchesOnly: true,
                  maxResults: 1000,
                  maxDoc: 50,
                  minLang: lang === 'en' ? 2 : 3,
                  matchHighlight: this.matchHighlight,
                  types: [ "root", "translation" ],
                  includeUnpublished,
                  sortLines: undefined, // These are not serialized
                  tipitakaCategories: undefined, // These are not serialized
              }],
            };
            return this.mj.hash(key);
        }

        findArgs(args) {
            if (!(args instanceof Array)) {
                throw new Error("findArgs(?ARRAY-OF-ARGS?)");
            }
            if (typeof args[0] === 'string') {
                var opts = {
                    pattern: args[0],
                    maxResults: args[1],
                }
            } else {
                var opts = args[0];
            }
            var {
                pattern: rawPattern,
                searchLang,
                lang,
                language, // DEPRECATED
                languages,
                minLang,    // minimum number of languages
                maxResults, // maximum number of grep files
                maxDoc,     // maximum number of returned documents
                matchHighlight,
                sortLines,
                showMatchesOnly,
                tipitakaCategories,
                types,
                includeUnpublished=this.includeUnpublished,
            } = opts;
            if (rawPattern == null) {
                throw new Error(`pattern is required`);
            }

            // STEP 1. extract embeddable options
            var argv = rawPattern.split(' ');
            var pattern = '';
            for (var i = 0; i < argv.length; i++) {
                var arg = argv[i];
                if (arg === '-d' || arg === '--maxDoc') {
                    let n = Number(argv[++i]);
                    if (!isNaN(n) && 0 < n ) {
                        maxDoc = n;
                    }
                } else if (arg === '-mr' || arg === '--maxResults') {
                    let n = Number(argv[++i]);
                    if (!isNaN(n) && 0 < n && n < 4000 ) {
                        maxResults = n;
                    }
                } else if (arg.startsWith('-tc:')) {
                    tipitakaCategories = arg.substring('-tc:'.length);
                } else if (arg === '-ml1' ) {
                    minLang = 1;
                } else if (arg === '-ml2' ) {
                    minLang = 2;
                } else if (arg === '-ml3' ) {
                    minLang = 3;
                } else if (arg === '-ml' || arg === '--minLang') {
                    let n = Number(argv[++i]);
                    if (!isNaN(n) && 0 < n && n <= 3) {
                        minLang = n;
                    }
                } else if (arg === '-l' || arg === '--lang') {
                    (arg = argv[++i]) && (lang = arg);
                } else if (arg === '-sl' || arg === '--searchLang') {
                    (arg = argv[++i]) && (searchLang = arg);
                } else {
                    pattern  = pattern ? `${pattern} ${arg}` : arg;
                }
            }

            // STEP 2. Assign default values
            var thisLang = this.lang;
            lang = lang || language || thisLang;
            minLang = minLang || 
                (lang === 'en' || searchLang === 'en' ? 2 : 3);
            pattern = BilaraWeb.sanitizePattern(pattern);
            pattern = BilaraWeb.normalizePattern(pattern);
            (showMatchesOnly == null) && (showMatchesOnly = true);
            languages = languages || [];
            (lang && !languages.includes(lang)) && languages.push(lang);
            maxResults = maxResults==null ? this.maxResults : maxResults;
            if (isNaN(Number(maxResults))) {
                throw new Error(`maxResults must be a number:${maxResults}`);
            }
            maxResults = Number(maxResults);
            maxDoc = Number(maxDoc==null ? this.maxDoc : maxDoc);
            (matchHighlight == null) && 
                (matchHighlight = this.matchHighlight);

            types = types || ['root', 'translation'];

            return {
                pattern,
                showMatchesOnly,
                languages,
                maxResults,
                searchLang,
                maxDoc,
                minLang,
                matchHighlight,
                sortLines,
                tipitakaCategories,
                lang,
                types,
                includeUnpublished,
            }
        }

        async find(...args) { try {
            var {
                axios,
                findMemo,
                memoizer,
            } = this;
            var {
                lang,
                pattern,
            } = this.findArgs(args);
            var that = this;
            var callSlowFind = (args)=>{
                return that.slowFind.call(that, args);
            };
            var result;
            if (this.isExample(pattern, lang)) {
                let guid = this.exampleGuid(pattern, lang);
                let url = [
                    'https://raw.githubusercontent.com',
                    'sc-voice',
                    'scv-static',
                    'main',
                    'api',
                    'Seeker.callSlowFind',
                    guid.substring(0,2),
                    `${guid}.json`,
                ].join('/');
                try {
                    let res = await axios.get(url);
                    result = res.data.value;
                } catch(e) {
                    let err = new Error(`${url} => ${e.message}`);
                    throw err;
                }
            } else {
                console.log(`dbg find() non-example:`, pattern);
            }
            return result;
        } catch(e) {
            this.warn(`find(${pattern})`, e.message);
            throw e;
        }}

        highlightExamples({segments, lang=this.lang}) {
            let highlightMatch = this.highlightMatch;
            let reLang = this.reExample[lang];
            if (!reLang) {
                return segments;
            }
            return segments.map(seg=>{
                let segLang = seg[lang];
                let newSeg = Object.assign({}, seg);
                return segLang
                    ? Object.assign(newSeg, {
                        [lang]: segLang.replace(reLang, highlightMatch),
                      })
                    : newSeg;
            });
        }

        async loadSuttaSegments({sutta_uid, lang='pli'}) {
            let {
                suidMap,
                axios,
                host,
            } = this;
            let includeUnpublished = lang === 'de' || this.includeUnpublished;
            let segments;
            let bilaraPaths = suidMap[sutta_uid] || {};
            let bpKey = Object.keys(bilaraPaths).find(key=>key.includes(`/${lang}/`));
            let bpSegs = bilaraPaths[bpKey];
            if (bpSegs) { 
                let branch = includeUnpublished ? 'unpublished' : 'published';
                let url = `${host}/suttacentral/bilara-data/${branch}/${bpSegs}`;
                try {
                    let res = await axios.get(url);
                    segments = res.data;
                } catch(e) {
                    this.info(`loadSuttaSegments(${sutta_uid}) ${url} => ${e.message}`);
                }
            } else {
                this.info(`loadSuttaSegments(${sutta_uid}) not found lang:${lang}`);
            }
            return segments;
        }

        async loadSutta({sutta_uid, lang=this.lang}) { try {
            var url = '';
            let {
                suidMap,
                axios,
                host,
                suttaCache,
            } = this;
            let key = [sutta_uid, lang].join('/');
            let sutta = suttaCache[key];
            if (sutta) {
                return sutta;
            }
            if (!(typeof lang === 'string')) {
                throw new Error(`expected string lang:${lang}`);
            }
            let pli = await this.loadSuttaSegments({sutta_uid, lang:'pli'}) || {};
            let segMap = Object.keys(pli).reduce((a,scid)=>{
                a[scid] = {scid, pli:pli[scid]};
                return a;
            },{});
            let langSegs = await this.loadSuttaSegments({sutta_uid, lang}) || {};
            Object.keys(langSegs).forEach(scid=>{
                segMap[scid] = segMap[scid] || { scid };
                segMap[scid][lang] = langSegs[scid];
            });
            let segments = Object.keys(segMap).map(scid=>segMap[scid]);
            segments = this.highlightExamples({segments, lang});
            let titleSegs = segments.filter(s=>s.scid.includes(':0'));
            let titles = titleSegs.map(s=>s[lang]||s.pli||'');
            return suttaCache[key] = {
              sutta_uid,
              lang,
              titles,
              segments,
            };
        } catch(e) {
            console.warn(`loadSutta(${sutta_uid}) ${url}`, e.message);
            throw e;
        }}

    }

    module.exports = exports.BilaraWeb = BilaraWeb;

})(typeof exports === "object" ? exports : (exports = {}));