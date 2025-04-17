"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[5642],{19327:(e,s,t)=>{t.r(s),t.d(s,{assets:()=>m,contentTitle:()=>d,default:()=>f,frontMatter:()=>p,metadata:()=>h,toc:()=>u});var r=t(52322),n=t(45392),i=t(77336),a=t(82009),o=t(99372),l=t(84560),c=t.n(l);const p={sidebar_position:1},d="Overview",h={id:"type/overview",title:"Overview",description:"ethdebug/format/type defines how to write data types as JSON.",source:"@site/spec/type/overview.mdx",sourceDirName:"type",slug:"/type/overview",permalink:"/format/pr-preview/pr-149/spec/type/overview",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/spec/type/overview.mdx",tags:[],version:"current",sidebarPosition:1,frontMatter:{sidebar_position:1},sidebar:"docsSidebar",previous:{title:"Specification overview",permalink:"/format/pr-preview/pr-149/spec/overview"},next:{title:"Key concepts",permalink:"/format/pr-preview/pr-149/spec/type/concepts"}},m={},u=[{value:"Reading this schema",id:"reading-this-schema",level:2},{value:"Example valid representations",id:"example-valid-representations",level:2}];function x(e){const s={a:"a",admonition:"admonition",code:"code",h1:"h1",h2:"h2",li:"li",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,n.a)(),...e.components},{Details:t}=s;return t||function(e,s){throw new Error("Expected "+(s?"component":"object")+" `"+e+"` to be defined: you likely forgot to import, pass, or provide it.")}("Details",!0),(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(s.h1,{id:"overview",children:"Overview"}),"\n",(0,r.jsxs)(s.admonition,{title:"Summary",type:"tip",children:[(0,r.jsxs)(s.p,{children:[(0,r.jsx)(s.strong,{children:"ethdebug/format/type"})," defines how to write data types as JSON."]}),(0,r.jsx)(s.p,{children:"Debuggers critically rely on having representations of the data types\nused by a piece of code. This information is used to highlight code display,\noffer links to where user-defined types are defined, and to render runtime\nvalues correctly."}),(0,r.jsx)(s.p,{children:"For a quick introduction to type representations, please see these example\nJSON values:"}),(0,r.jsxs)(t,{children:[(0,r.jsx)("summary",{children:"A valid type representation"}),(0,r.jsx)(s.pre,{children:(0,r.jsx)(s.code,{className:"language-json",children:'{\n  "kind": "uint",\n  "bits": 256\n}\n'})})]}),(0,r.jsxs)(t,{children:[(0,r.jsx)("summary",{children:"An invalid type representation"}),(0,r.jsx)(s.pre,{children:(0,r.jsx)(s.code,{className:"language-json",children:'"uh, some kind of number"\n'})})]}),(0,r.jsxs)(s.p,{children:["See ",(0,r.jsx)(s.a,{href:"#example-valid-representations",children:"additional examples"})," below\nfor a sample of valid type representations according to this schema."]})]}),"\n",(0,r.jsx)(s.p,{children:"This format defines schemas for representing the data types allowable in a\nsupporting high-level language."}),"\n",(0,r.jsxs)(s.p,{children:["JSON values that adhere to this schema may (for example) represent a particular\n",(0,r.jsx)(s.code,{children:"uint"})," type (like ",(0,r.jsx)(s.code,{children:"uint256"}),"), a ",(0,r.jsx)(s.code,{children:"struct"})," type with a particular set of member\nfields, a particular ",(0,r.jsx)(s.code,{children:"mapping"})," type from a certain key type to a certain value\ntype, and so on."]}),"\n",(0,r.jsx)(s.h2,{id:"reading-this-schema",children:"Reading this schema"}),"\n",(0,r.jsxs)(s.p,{children:["The ",(0,r.jsx)(s.strong,{children:"ethdebug/format/type"})," schema is a root schema that conditionally defers\nto one or more other related schemas in the ethdebug/format/type/* namespace."]}),"\n",(0,r.jsxs)(s.p,{children:["These schemas (like all schemas in this format) are specified as\n",(0,r.jsx)(s.a,{href:"https://json-schema.org",children:"JSON Schema"}),", draft 2020-12."]}),"\n",(0,r.jsx)(s.p,{children:"Please refer to one or more of the following resources in this section:"}),"\n",(0,r.jsxs)(s.ul,{children:["\n",(0,r.jsxs)(s.li,{children:["\n",(0,r.jsxs)(s.p,{children:[(0,r.jsx)(s.a,{href:"/spec/type/concepts",children:"Key concepts"})," introduces how types are represented in\nthis schema."]}),"\n"]}),"\n",(0,r.jsxs)(s.li,{children:["\n",(0,r.jsxs)(s.p,{children:[(0,r.jsx)(s.a,{href:"/spec/type",children:"Schema"})," presents the root ",(0,r.jsx)(s.strong,{children:"ethdebug/format/type"})," schema, which\naggregates links to all relevant subschemas."]}),"\n"]}),"\n",(0,r.jsxs)(s.li,{children:["\n",(0,r.jsxs)(s.p,{children:["The categories ",(0,r.jsx)(s.a,{href:"/spec/category/elementary-types",children:"Elementary types"}),"\nand ",(0,r.jsx)(s.a,{href:"/spec/category/complex-types",children:"Complex types"})," comprise individual\nsubschemas for all known kinds of types."]}),"\n"]}),"\n",(0,r.jsxs)(s.li,{children:["\n",(0,r.jsxs)(s.p,{children:["The ",(0,r.jsx)(s.a,{href:"/spec/type/base",children:"Base schema"})," defines the mimimum overall structure of\n",(0,r.jsx)(s.strong,{children:"ethdebug/format/type"})," objects for purposes of schema extension."]}),"\n"]}),"\n"]}),"\n",(0,r.jsx)(s.h2,{id:"example-valid-representations",children:"Example valid representations"}),"\n",(0,r.jsxs)(s.p,{children:["Here are some example ",(0,r.jsx)(s.strong,{children:"ethdebug/format/type"})," type representations."]}),"\n",(0,r.jsx)(i.default,{children:["ethdebug/format/type/elementary/address","ethdebug/format/type/complex/mapping","ethdebug/format/type/complex/struct"].map(((e,s)=>{const{schema:t}=(0,o.describeSchema)({schema:`schema:${e}`});return(0,r.jsx)(a.default,{value:s,label:e.split("/").pop(),children:(0,r.jsx)(c(),{language:"json",title:`Example ${e} type`,children:JSON.stringify(t.examples[0],void 0,2)})},s)}))})]})}function f(e={}){const{wrapper:s}={...(0,n.a)(),...e.components};return s?(0,r.jsx)(s,{...e,children:(0,r.jsx)(x,{...e})}):x(e)}}}]);