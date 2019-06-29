import path from 'path';
import {version} from '../package.json';

export default class Getopt {
  constructor (optionsPattern) {
    this.short_options = {};
    this.long_options = {};
    this.long_names = [];
    this.events = {};
    this.argv = [];
    this.options = {};
    this.unique_names = {};
    this.optionsPattern = [];

    this.errorFunc = function(e) {
      console.error(e.message);
      process.exit(1);
    };

    if (process.argv[1]) {
      this.help = (
`Usage:
  node ${ path.basename(process.argv[1])} [OPTION]
Options:
[[OPTIONS]]`);
    } else {
      this.help = '[[OPTIONS]]';
    }
    this.append(optionsPattern);
  }

  append (optionsPattern) {
    for (const option of optionsPattern) {
      let [short_name, definition, comment, def] = option;
      if (comment == null) comment = '';
      if (definition == null) definition = '';
      if (short_name == null) short_name = '';
      else short_name = short_name.trim();

      let long_name = definition.match(/^([\w\-]*)/)[0].trim();
      const has_argument = definition.indexOf('=') !== -1;
      const multi_supported = definition.indexOf('+') !== -1;
      const optional = /\[=.*?\]/.test(definition);

      if (optional && short_name) {
        throw new Error('optional argument can only work with long option');
      }
      if (!long_name) long_name = short_name;

      const fixed_long_name = 'opt_' + long_name;
      const name = long_name;

      if (long_name === '') {
        throw new Error(`empty option found. the last option name is ${this.long_names.slice(-1)}`);
      }

      if (this.unique_names[fixed_long_name] == null) {
        this.long_names.push(long_name);
        this.long_options[long_name] = {
          name,
          short_name,
          long_name,
          has_argument,
          multi_supported,
          comment,
          optional,
          definition,
          def,
        };
        this.unique_names[fixed_long_name] = true;
      } else {
        throw new Error(`option ${long_name} is redefined.`);
      }

      if (short_name !== '') {
        if (short_name.length !== 1) {
          throw new Error('short option must be single characters');
        }
        this.short_options[short_name] = this.long_options[long_name];
      }
    }
    return this;
  }

  // fill pattern if not exists
  fill (pattern) {
    const [s_, l_] = pattern;
    let s = '';
    let l = '';
    this.short_options[s_] || (s = s_);
    this.long_options[l_] || (l = l_);
    if (s || l) {
      // this.append([[s, l, pattern[2..]...]])
      //TODO:
      return this.append([[s, l].concat([].slice.call(pattern.slice(2)))]);
    }
  }

  getOptionByName (name) {
    return this.long_options[name] || this.short_options[name];
  }

  getOptionName (name) {
    const o = this.getOptionByName(name);
    return o && o.name || null;
  }

  // Events
  on (name, cb) {
    let iname;
    if (name) {
      iname = this.getOptionName(name);
      if (!iname) {
        throw new Error(`unknown option ${name}`);
      }
    } else {
      iname = name;
    }
    this.events[iname] = cb;
    return this;
  }

  emit (name, value) {
    const event = this.events[this.getOptionName(name)];
    if (event) {
      event.call(this, value);
    } else {
      throw new Error(`Getopt event on '${name}' is not found`);
    }
  }

  // Command line parser
  save_option_ (options, option, argv) {
    let value;
    if (option.has_argument) {
      if (argv.length === 0) {
        throw new Error(`option ${option.long_name} need argument`);
      }
      value = argv.shift();
    } else {
      value = true;
    }

    const name = option.name;
    if (option.multi_supported) {
      if (options[name] == null) options.name = [];
      options[name].push(value);
    } else {
      options[name] = value;
    }
    const evt = this.events[name];
    if (evt) evt.call(this, value);
    // TODO: else?
    return this;
  }

  parse (argv) {
    const rt_argv = [];
    const rt_options = {};
    try {
      // clone argv
      argv = argv.slice(0);
      for (const long_name of this.long_names) {
        const option = this.long_options[long_name];
        // set all proto keys eg: constructor toString to undefined
        if (option.def !== null || rt_options[option.long_name] !== null) {
          rt_options[option.long_name] = option.def;
        }
      }
      let arg;
      while ((arg = argv.shift())) {
        console.log(arg) //TODO:
        let _matches;
        if (_matches = arg.match(/^-(\w[\w\-]*)/)) {
          // short option
          console.log({short:_matches})
          for (const [i, short_name] of _matches[1].split('').entries()) {
            const option = this.short_options[short_name]
            if (!option) {
              throw new Error(`invalid option ${short_name}`);
            }

            if (option.has_argument) {
              if (i < arg.length - 2)
                argv.unshift(arg.slice(i+2));
              this.save_option_(rt_options, option, argv)
              break
            } else {
              this.save_option_(rt_options, option, argv)
            }
          }
        } else if (_matches = arg.match(/^--(\w[\w\-]*)((?:=[^]*)?)$/)) {
          // long option
          console.log({long:_matches})
          let [_, long_name, value] = _matches;
          // const long_name = _matches[1]
          // let value = _matches[2];
          // value     = arg.substring(long_name.length+2)
          const option = this.long_options[long_name]
          if (!option) {
            throw new Error(`invalid option ${long_name}`);
          }

          if (value !== '') {
            value = value.slice(1);
            argv.unshift(value);
          } else if (option.optional) {
            argv.unshift('');
          }
          this.save_option_(rt_options, option, argv);

        } else if (arg == '--') {
          console.log({post:_matches})
          rt_argv = rt_argv.concat(argv);
          for (arg in argv) {
            if (this.events[''])
              this.events[''].call(this, arg);
          }
          break;
        } else {
          rt_argv.push(arg);
          if (this.events[''])
            this.events[''].call(this, arg);
        }
        // assign to short name
        for (const name of Object.keys(rt_options)) {
          const sname = this.long_options[name].short_name
          if (sname !== '')
            rt_options[sname] = rt_options[name]
        }
      }
    } catch (e) {
      this.errorFunc(e);
    }

    this.argv = rt_argv;
    this.options = rt_options;
    return this;
  }

  parse_system () {
    return parseSystem();
  }

  parseSystem () {
    this.parse(process.argv.slice(2));
  }

  // Help Controller
  setHelp (help) {
    this.help = help;
    return this;
  }

  sort() {
    this.long_names.sort((a, b) => {
      return a > b && 1 || a < b && -1 || 0;
    });
  }

  getHelp() {
    const ws = [];
    const options = [];
    const table = [];

    for (const lname of this.long_names) {
      const tr = [];
      let option = this.long_options[lname];
      let {short_name, long_name, comment, definition, def} = option;
      let token;
      if (short_name) {
        if (short_name == long_name) {
          // only has short name
          token = "  -#{short_name}"
        } else {
          // both has short name and long name
          token = "  -#{short_name}, --#{definition}"
        }
      } else {
          // only has long name
          token = "      --#{definition}"
      }
      tr.push(token);
      tr.push(" " + comment);
      if (def)
        tr.push(` (default: ${def})`);
      table.push(tr);
    }
    for (const tr of table) {
      for (const [i, td] of tr.entries()) {
        ws[i] = ws[i] || 0;
        ws[i] = Math.max(ws[i], td.length);
      }
    }

//     lines = for tr in table
//       line = ''
//       for td, i in tr
//         if i
//           n = ws[i-1] - tr[i-1].length
//           while n--
//             line += ' '
//         line += td
//       line.trimRight()
    return this.help.replace('[[OPTIONS]]', lines.join("\n"));
  }

  showHelp() {
    console.info(this.getHelp());
    return this;
  }

  bindHelp (help) {
    if (help) {
      this.setHelp(help);
    }
    this.fill(['h', 'help', 'display this help']);
    this.on('help', () => {
      this.showHelp();
      process.exit(0);
    });
    return this;
  }

  error(errorFunc) {
    this.errorFunc = errorFunc;
    return this;
  }

  static getVersion() {
    return version;
  }

  // For oneline creator
  static create(options) {
    return new Getopt(options);
  }
};

Getopt.HAS_ARGUMENT = true;
Getopt.NO_ARGUMENT = false;
Getopt.MULTI_SUPPORTED = true;
Getopt.SINGLE_ONLY = false;
Getopt.VERSION = version;

// # vim: sw=2 ts=2 sts=2 expandtab :
