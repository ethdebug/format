"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[7219],{4793:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>c,contentTitle:()=>o,default:()=>d,frontMatter:()=>s,metadata:()=>a,toc:()=>h});var r=i(2322),t=i(5392);const s={sidebar_position:1},o="Overview",a={id:"pointer/overview",title:"Overview",description:"ethdebug/format/pointer is a JSON schema for pointing to bytes in the EVM.",source:"@site/spec/pointer/overview.mdx",sourceDirName:"pointer",slug:"/pointer/overview",permalink:"/format/spec/pointer/overview",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/spec/pointer/overview.mdx",tags:[],version:"current",sidebarPosition:1,frontMatter:{sidebar_position:1},sidebar:"docsSidebar",previous:{title:"ethdebug/format/pointer",permalink:"/format/spec/category/ethdebugformatpointer"},next:{title:"Key concepts",permalink:"/format/spec/pointer/concepts"}},c={},h=[{value:"Reading this schema",id:"reading-this-schema",level:2}];function l(e){const n={a:"a",admonition:"admonition",em:"em",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...(0,t.a)(),...e.components};return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(n.h1,{id:"overview",children:"Overview"}),"\n",(0,r.jsxs)(n.admonition,{type:"tip",children:[(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer"})," is a JSON schema for pointing to bytes in the EVM."]}),(0,r.jsx)(n.p,{children:"Debuggers need to know where to find variables when looking at a running\nmachine, which means that debuggers must be able to find the related regions\nof the stack, memory, storage, etc. where each of the variables in scope live\nat any point in time."}),(0,r.jsxs)(n.p,{children:["This gets particularly complicated on the EVM because many common languages\nemploy novel techniques for organizing data. (Some of these\ntechniques serve to work around machine limitations; others serve to\ntake advantage of the unique way the EVM is designed.) For a thorough\ndescription of how Solidity organizes memory, please see related work\n",(0,r.jsx)(n.a,{href:"https://ethdebug.github.io/solidity-data-representation/",children:"Data Representation in Solidity"}),"."]}),(0,r.jsxs)(n.p,{children:["As a consequence of this complexity, this schema seeks to allow compilers the\nexpressiveness required for describing these allocation techniques at\ncompile-time. To readers continuing on,\na ",(0,r.jsx)(n.a,{href:"https://en.wikipedia.org/wiki/Greenspun%27s_tenth_rule",children:"warning"})," may apply."]})]}),"\n",(0,r.jsx)(n.p,{children:"This format defines a schema for locating semantically-cohesive bytes ranges\nin a running EVM."}),"\n",(0,r.jsxs)(n.p,{children:["JSON values in this schema describe primarily ",(0,r.jsx)(n.em,{children:"where"})," data is to be found to\nidentify to debuggers reading a trace (or attached to a running EVM) which data\nmust be read from which location(s). Values in this schema may address\na single continuous region of bytes or an aggregation of non-continuous related\nregions."]}),"\n",(0,r.jsx)(n.h2,{id:"reading-this-schema",children:"Reading this schema"}),"\n",(0,r.jsxs)(n.p,{children:["The ",(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer"})," schema is a root schema that composes other\nrelated schemas in the ethdebug/format/pointer/* namespace."]}),"\n",(0,r.jsxs)(n.p,{children:["These schemas (like all schemas in this format) are specified as\n",(0,r.jsx)(n.a,{href:"https://json-schema.org",children:"JSON Schema"}),", draft 2020-12."]}),"\n",(0,r.jsx)(n.p,{children:"Please refer to one or more of the following resources in this section, or\nsee the navigation bar for complete contents."}),"\n",(0,r.jsxs)(n.ul,{children:["\n",(0,r.jsxs)(n.li,{children:["\n",(0,r.jsx)(n.p,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/concepts",children:"Key concepts"})}),"\n"]}),"\n",(0,r.jsxs)(n.li,{children:["\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.a,{href:"/spec/pointer",children:"Schema"})," (",(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer"})," schema listing)"]}),"\n"]}),"\n",(0,r.jsxs)(n.li,{children:["\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.a,{href:"/spec/pointer/region",children:"Region schema"})," (",(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region"})," schema listing)"]}),"\n"]}),"\n",(0,r.jsxs)(n.li,{children:["\n",(0,r.jsx)(n.p,{children:"Individual region schemas for particular data locations:"}),"\n",(0,r.jsxs)(n.ul,{children:["\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/region/location/stack",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region/stack"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/region/location/memory",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region/memory"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/region/location/storage",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region/storage"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/region/location/calldata",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region/calldata"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/region/location/returndata",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region/returndata"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/region/location/transient",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region/transient"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/region/location/code",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/region/code"})})}),"\n"]}),"\n"]}),"\n",(0,r.jsxs)(n.li,{children:["\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.a,{href:"/spec/pointer/collection",children:"Collection schema"})," (",(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/collection"})," schema listing)"]}),"\n"]}),"\n",(0,r.jsxs)(n.li,{children:["\n",(0,r.jsx)(n.p,{children:"Pointer collection schemas:"}),"\n",(0,r.jsxs)(n.ul,{children:["\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/collection/group",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/collection/group"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/collection/list",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/collection/list"})})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.a,{href:"/spec/pointer/collection/conditional",children:(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/collection/conditional"})})}),"\n"]}),"\n"]}),"\n",(0,r.jsxs)(n.li,{children:["\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.a,{href:"/spec/pointer/expression",children:"Expression syntax"})," (",(0,r.jsx)(n.strong,{children:"ethdebug/format/pointer/expression"})," schema listing)"]}),"\n"]}),"\n"]})]})}function d(e={}){const{wrapper:n}={...(0,t.a)(),...e.components};return n?(0,r.jsx)(n,{...e,children:(0,r.jsx)(l,{...e})}):l(e)}}}]);