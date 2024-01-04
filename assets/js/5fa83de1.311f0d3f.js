"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[156],{8501:(e,n,t)=>{t.r(n),t.d(n,{assets:()=>d,contentTitle:()=>o,default:()=>l,frontMatter:()=>i,metadata:()=>a,toc:()=>c});var s=t(5893),r=t(1151);const i={sidebar_position:1},o="Overview",a={id:"type/overview",title:"Overview",description:"ethdebug/format/type defines how to write data types as JSON.",source:"@site/spec/type/overview.mdx",sourceDirName:"type",slug:"/type/overview",permalink:"/format/spec/type/overview",draft:!1,unlisted:!1,tags:[],version:"current",sidebarPosition:1,frontMatter:{sidebar_position:1},sidebar:"docsSidebar",previous:{title:"Type schemas",permalink:"/format/spec/category/type-schemas"},next:{title:"ethdebug/format/type [placeholder]",permalink:"/format/spec/type/"}},d={},c=[];function h(e){const n={a:"a",admonition:"admonition",code:"code",em:"em",h1:"h1",li:"li",ol:"ol",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,r.a)(),...e.components},{Details:t}=n;return t||function(e,n){throw new Error("Expected "+(n?"component":"object")+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}("Details",!0),(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(n.h1,{id:"overview",children:"Overview"}),"\n",(0,s.jsxs)(n.admonition,{type:"tip",children:[(0,s.jsxs)(n.p,{children:[(0,s.jsx)(n.strong,{children:"ethdebug/format/type"})," defines how to write data types as JSON."]}),(0,s.jsx)(n.p,{children:"Debuggers critically rely on having representations of the data types\nused by a piece of code. This information is used to highlight code display,\noffer links to where user-defined types are defined, and to render runtime\nvalues correctly."}),(0,s.jsx)(n.p,{children:"For a quick introduction to type representations, please see these example\nJSON values:"}),(0,s.jsxs)(t,{children:[(0,s.jsx)("summary",{children:"A valid type representation"}),(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-json",children:'{\n  "kind": "uint",\n  "bits": 256\n}\n'})})]}),(0,s.jsxs)(t,{children:[(0,s.jsx)("summary",{children:"An invalid type representation"}),(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-json",children:'"uh, some kind of number"\n'})})]})]}),"\n",(0,s.jsx)(n.p,{children:"This format defines schemas for representing the data types allowable in a\nsupporting high-level language."}),"\n",(0,s.jsxs)(n.p,{children:["JSON values that adhere to this schema may (for example) represent a particular\n",(0,s.jsx)(n.code,{children:"uint"})," type (like ",(0,s.jsx)(n.code,{children:"uint256"}),"), a ",(0,s.jsx)(n.code,{children:"struct"})," type with a particular set of member\nfields, a particular ",(0,s.jsx)(n.code,{children:"mapping"})," type from a certain key type to a certain value\ntype, and so on."]}),"\n",(0,s.jsx)(n.p,{children:"This schema is broadly divided into two sections:"}),"\n",(0,s.jsxs)(n.ol,{children:["\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsxs)(n.p,{children:["A canonical Type schema\n(",(0,s.jsx)(n.a,{href:"/spec/type",children:(0,s.jsx)(n.strong,{children:"ethdebug/format/type"})}),"), which includes\nsubschemas for included known types."]}),"\n",(0,s.jsxs)(n.p,{children:["When adhering to this format, this schema is considered ",(0,s.jsx)(n.strong,{children:"sufficient"})," for\nrepresenting any supported type."]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsxs)(n.p,{children:["A base Type schema\n(",(0,s.jsx)(n.a,{href:"/spec/type",children:(0,s.jsx)(n.strong,{children:"ethdebug/format/type/base"})}),"), which specifies a\nminimal definition of any type, known or unknown."]}),"\n",(0,s.jsxs)(n.p,{children:["When adhering to this format, this schema is considered ",(0,s.jsx)(n.strong,{children:"necessary"})," for\nrepresenting any supported type."]}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.p,{children:"In other words:"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsxs)(n.p,{children:["Compilers adhering to this format ",(0,s.jsx)(n.strong,{children:"should"})," use the canonical\n",(0,s.jsx)(n.strong,{children:"ethdebug/format/type"})," schema when representing known types\n(e.g., uints, arrays, structs, etc.)."]}),"\n"]}),"\n",(0,s.jsxs)(n.li,{children:["\n",(0,s.jsxs)(n.p,{children:["Compilers ",(0,s.jsx)(n.strong,{children:"must"})," still adhere to the ",(0,s.jsx)(n.strong,{children:"ethdebug/format/type/base"})," schema\nwhen representing types not known to this format."]}),"\n"]}),"\n"]}),"\n",(0,s.jsx)(n.admonition,{type:"note",children:(0,s.jsxs)(n.p,{children:["Any representation adhering to the former also adheres to the latter,\nsince ",(0,s.jsx)(n.strong,{children:"ethdebug/format/type"})," extends ",(0,s.jsx)(n.strong,{children:"ethdebug/format/type/base"}),"."]})}),"\n",(0,s.jsxs)(n.admonition,{type:"info",children:[(0,s.jsxs)(n.p,{children:["To highlight one purpose behind this separation, consider that this format\nseeks to be complete enough to be useful ",(0,s.jsx)(n.em,{children:"and"})," flexible enough to afford\nextension."]}),(0,s.jsxs)(n.p,{children:["While ",(0,s.jsx)(n.strong,{children:"ethdebug/format/type"})," aims to cover all of the available kinds of\ntypes available in EVM languages today, languages in the future may offer\nadditional kinds of types. ",(0,s.jsx)(n.strong,{children:"ethdebug/format/type/base"})," serves to address\nthis concern."]})]})]})}function l(e={}){const{wrapper:n}={...(0,r.a)(),...e.components};return n?(0,s.jsx)(n,{...e,children:(0,s.jsx)(h,{...e})}):h(e)}},1151:(e,n,t)=>{t.d(n,{Z:()=>a,a:()=>o});var s=t(7294);const r={},i=s.createContext(r);function o(e){const n=s.useContext(i);return s.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function a(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(r):e.components||r:o(e.components),s.createElement(i.Provider,{value:n},e.children)}}}]);