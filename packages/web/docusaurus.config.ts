import {themes as prismThemes} from 'prism-react-renderer';
import path from "path";
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type { Configuration } from "webpack";

const baseUrl = process.env["BASE_URL"] || "/";

const config: Config = {
  title: 'ethdebug format',
  tagline: 'Debugging data format for smart contracts',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://ethdebug.github.io',

  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'ethdebug', // Usually your GitHub org/user name.
  projectName: 'format', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    ["docusaurus-json-schema-plugin", {}],
    "@saucelabs/theme-github-codeblock"
  ],

  plugins: [
    async function customResolvers(context, options) {
      return {
        name: "custom-resolve",
        configureWebpack(config: Configuration) {
          return {
            resolve: {
              alias: {
                react: path.resolve('../../node_modules/react'),
              },
              fallback: {
                buffer: false,
                util: false
              }
            }
          };
        }
      }
    },

    [
      "./plugins/project-code-plugin.ts",
      {
        packages: {
          "@ethdebug/format": {
            tsConfigFilePath:
              path.resolve(__dirname, "../format/tsconfig.json")
          },
          "@ethdebug/pointers": {
            tsConfigFilePath:
              path.resolve(__dirname, "../pointers/tsconfig.json")
          }
        }
      }
    ],

    // Used to maintain separate spec/ directory, outside the core docs/
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'spec',
        path: 'spec',
        routeBasePath: 'spec',
        sidebarPath: './sidebars.ts',
        editUrl:
          'https://github.com/ethdebug/format/tree/main/packages/web'
        // ... other options
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/ethdebug/format/tree/main/packages/web',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'ethdebug format',
      logo: {
        alt: 'ethdebug logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/spec/overview',
          label: 'Specification',
          position: 'left',
          activeBaseRegex: `/spec/`,
        },
        {
          to: '/status',
          label: "Status: Draft",
          className: "status-indicator",
          position: "right"
        },
        {
          href: 'https://github.com/ethdebug/format',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: "Project overview",
              to: "/docs/overview"
            },
            {
              label: 'Known challenges',
              to: '/docs/known-challenges',
            },
          ],
        },
        {
          title: 'Spec',
          items: [
            {
              label: "Specification overview",
              to: "/spec/overview"
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Matrix.chat',
              href: 'https://matrix.to/#/#ethdebug:matrix.org',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/ethdebug',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/ethdebug/format',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} by ethdebug contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: [
        "json"
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
