"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[5304],{76161:(e,t,n)=>{n.r(t),n.d(t,{assets:()=>M,contentTitle:()=>w,default:()=>R,frontMatter:()=>k,metadata:()=>E,toc:()=>P});var o=n(52322),i=n(45392),r=n(2784);function s(e,t){const n=function(e,t){let{sources:n}=t;if("function"!=typeof e)return e;const o=function(e,t){void 0===t&&(t={});const o="source"in t&&t.source?n.find((e=>e.id===t.source?.id)):n[0];if(!o)return;const i=t.after||"",r=o.contents.indexOf(i);if(-1===r)throw new Error(`Unexpected could not find string ${t.after} as prior occurrence to ${e}`);const s=r+i.length,a=o.contents.indexOf(e,s);if(-1===a)throw new Error(`Unexpected could not find string ${e}`);const c=e.length;return{source:{id:o.id},range:{offset:a,length:c}}};return e({findSourceRange:o})}(e.context,t);return{...e,context:n}}const a=(0,r.createContext)(void 0);function c(){const e=(0,r.useContext)(a);if(void 0===e)throw new Error("useProgramExampleContext must be used within a ProgramExampleContextProvider");return e}function l(e){let{children:t,...n}=e;const{sources:i,instructions:c}=n,l=function(e){const{results:t}=e.reduce(((e,t)=>{let{nextOffset:n,results:o}=e;const i={offset:n,...t};return{nextOffset:n+(1+Math.ceil((t.operation.arguments||[]).map((e=>"number"==typeof e?e.toString(16):e.slice(2))).join("").length/2)),results:[...o,i]}}),{nextOffset:0,results:[]});return t}(c),d=l.map((e=>s(e,{sources:i}))),[u,h]=(0,r.useState)(),[g,f]=(0,r.useState)(),[p,m]=(0,r.useState)("simple");return(0,r.useEffect)((()=>{if(void 0===u)return void f(void 0);const e=d.find((e=>{let{offset:t}=e;return t===u}));if(!e)throw new Error(`Unexpected could not find instruction with offset ${u}`);f(e)}),[u,f]),(0,o.jsx)(a.Provider,{value:{sources:i,instructions:d,highlightedInstruction:g,highlightInstruction:h,highlightMode:p,showDetails:()=>m("detailed"),hideDetails:()=>m("simple")},children:t})}var d=n(43375),u=n(49253);function h(){const[e,t]=(0,r.useState)();return(0,r.useEffect)((()=>{(async function(){const e=await d.Ew({themes:[n.e(5071).then(n.bind(n,95071))],langs:[n.e(3464).then(n.bind(n,3464)),n.e(7886).then(n.bind(n,27886))],engine:(0,u.QG)(n.e(3207).then(n.bind(n,13207)))}),t="github-light";return{highlight(n,o){let{language:i,decorations:r}=o;return e.codeToHtml(n,{lang:i||"text",theme:t,decorations:r})}}})().then(t)}),[t]),e}function g(e){let{code:t,...n}=e;const i=h();if(!i)return(0,o.jsx)(o.Fragment,{children:"Loading..."});const r=i.highlight(t,n);return(0,o.jsx)("div",{dangerouslySetInnerHTML:{__html:r}})}var f=n(99372);function p(e){const{sources:t,highlightedInstruction:n,highlightMode:i}=c();if(1!==t.length)throw new Error("Multiple sources per example not currently supported");const r=t[0],s=n?.context,a=f.Program.Context.isCode(s)?function(e,t){let{code:n}=e;const{offset:o,length:i}=x(n.range,t);return[{start:o,end:o+i,properties:{class:"highlighted-code"}}]}(s,r):[],l=[...a,...f.Program.Context.isVariables(s)?m(s,r):[]],d="detailed"===i?l:a;return(0,o.jsx)(g,{className:"source-contents",code:r.contents,language:"javascript",decorations:d,...e})}function m(e,t){let{variables:n}=e;return n.map((e=>{let{declaration:n}=e;const{offset:o,length:i}=x(n?.range,t);return{start:o,end:o+i,properties:{class:"highlighted-variable-declaration"}}}))}function x(e,t){const{offset:n,length:o}=e?{offset:Number(e.offset),length:Number(e.length)}:{offset:0,length:t.contents.length};return{offset:n,length:o}}function v(){const{instructions:e,highlightedInstruction:t,highlightInstruction:n,highlightMode:i,showDetails:s,hideDetails:a}=c(),[l,d]=(0,r.useState)(),[u,h]=(0,r.useState)();(0,r.useEffect)((()=>{if(void 0!==l)return t?.offset!==l&&n(l),void("simple"===i&&s());"detailed"===i&&a(),void 0===u?n(void 0):t?.offset!==u&&n(u)}),[l,u,t,i]);const g=e.at(-1).offset.toString(16).length;return(0,o.jsx)("dl",{className:"opcodes",children:e.map((e=>(0,o.jsx)(b,{instruction:e,active:l===e.offset,paddingLength:g,onClick:()=>{return t=e.offset,d(t===l?void 0:t);var t},onMouseEnter:()=>{return t=e.offset,h(t);var t},onMouseLeave:()=>(e.offset,h(void 0))},e.offset)))})}function b(e){const{instruction:t,active:n,paddingLength:i,onClick:r,onMouseEnter:s,onMouseLeave:a}=e,{offset:c,operation:l,context:d}=t,u=(0,o.jsxs)(o.Fragment,{children:["0x",c.toString(16).padStart(i,"0")]}),h=d&&"remark"in d?(0,o.jsxs)(o.Fragment,{children:["  (",d.remark,")"]}):(0,o.jsx)(o.Fragment,{}),g=(0,o.jsxs)(o.Fragment,{children:[l&&(0,o.jsx)("code",{children:[l.mnemonic,...l.arguments||[]].join(" ")}),h]});return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("dt",{className:n?"active":"",onClick:r,onMouseEnter:s,onMouseLeave:a,title:"Click for more instruction details",children:u}),(0,o.jsx)("dd",{onMouseEnter:s,onMouseLeave:a,children:g})]})}function j(){const{highlightedInstruction:e}=c();return(0,o.jsx)(o.Fragment,{children:(0,o.jsx)(g,{language:"javascript",code:JSON.stringify(e,void 0,2)})})}var V=n(20713),y=n(27718);function S(e){const{highlightedInstruction:t,highlightMode:n}=c(),i=(0,o.jsxs)(V.Z,{type:"tip",children:["Select an instruction offset to see associated ",(0,o.jsx)("strong",{children:"ethdebug/format"})," debugging information."]}),r=(0,o.jsxs)(V.Z,{type:"info",children:[(0,o.jsxs)("p",{children:["The selected instruction provides the following ",(0,o.jsxs)(y.Z,{to:"/spec/program/context",children:[(0,o.jsx)("strong",{children:"ethdebug/format"})," Program contexts"]}),":"]}),(0,o.jsxs)("ul",{children:[(0,o.jsxs)("li",{children:[(0,o.jsx)("strong",{children:"Code context"})," is highlighted ",(0,o.jsx)("span",{className:"highlighted-code",children:"in this style"})," above."]}),(0,o.jsxs)("li",{children:[(0,o.jsx)("strong",{children:"Variables context"})," is indicated by variable declarations highlighted ",(0,o.jsx)("span",{className:"highlighted-variable-declaration",children:"in this style"})," above."]})]})]}),s=t&&"detailed"===n?(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("h3",{children:"Details"}),r,(0,o.jsxs)("details",{children:[(0,o.jsxs)("summary",{children:["See full ",(0,o.jsx)("strong",{children:"ethdebug/format/program/instruction"})," object"]}),(0,o.jsx)(j,{})]})]}):(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("h3",{children:"Details"}),i]});return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("h2",{children:"Interactive example"}),(0,o.jsxs)("div",{className:"viewer-row",children:[(0,o.jsxs)("div",{children:[(0,o.jsx)("h3",{id:"source-contents",children:"Source contents"}),(0,o.jsx)(p,{})]}),(0,o.jsxs)("div",{children:[(0,o.jsx)("h3",{id:"compiled-opcodes",children:"Compiled opcodes"}),(0,o.jsx)(v,{})]})]}),s]})}const k={sidebar_position:3},w="Example program",E={id:"program/example",title:"Example program",description:"<ProgramExampleContextProvider",source:"@site/spec/program/example.mdx",sourceDirName:"program",slug:"/program/example",permalink:"/format/spec/program/example",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/spec/program/example.mdx",tags:[],version:"current",sidebarPosition:3,frontMatter:{sidebar_position:3},sidebar:"docsSidebar",previous:{title:"Key concepts",permalink:"/format/spec/program/concepts"},next:{title:"Schema",permalink:"/format/spec/program/"}},M={},P=[];function C(e){const t={a:"a",h1:"h1",p:"p",...(0,i.a)(),...e.components};return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(t.h1,{id:"example-program",children:"Example program"}),"\n",(0,o.jsxs)(l,{sources:[{id:0,path:"PaidIncrementer.eg",language:"examplelang",contents:"name PaidIncrementer;\n\n// define storage layout to include variable\n// at slot 0\nstorage {\n  [0] storedValue: uint256;\n}\n\n// runtime logic\ncode {\n  // require fee for incrementing\n  if (msg.callvalue < 3 finney) {\n    return;\n  }\n\n  let localValue = storedValue + 1;\n  storedValue = localValue;\n}\n"}],instructions:[{operation:{mnemonic:"PUSH6",arguments:["0x02ba7def3000"]},context:({findSourceRange:e})=>({code:e("3 finney"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}],remark:"hexadecimal for 3 finney"})},{operation:{mnemonic:"CALLVALUE"},context:({findSourceRange:e})=>({code:e("msg.callvalue"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}]})},{operation:{mnemonic:"LT"},context:({findSourceRange:e})=>({code:e("msg.callvalue < 3 finney"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}]})},{operation:{mnemonic:"PUSH1",arguments:["0x13"]},context:({findSourceRange:e})=>({code:e("if (msg.callvalue < 3 finney) {\n    return;\n  }"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}]})},{operation:{mnemonic:"JUMPI"},context:({findSourceRange:e})=>({code:e("if (msg.callvalue < 3 finney) {\n    return;\n  }"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}],remark:"jump to end unless sufficient fee"})},{operation:{mnemonic:"PUSH0"},context:({findSourceRange:e})=>({code:e("storedValue",{after:"localValue ="}),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}],remark:"push stack slot of state variable"})},{operation:{mnemonic:"SLOAD"},context:({findSourceRange:e})=>({code:e("storedValue",{after:"let localValue"}),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}]})},{operation:{mnemonic:"PUSH1",arguments:["0x01"]},context:({findSourceRange:e})=>({code:e("1"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}]})},{operation:{mnemonic:"ADD"},context:({findSourceRange:e})=>({code:e("let localValue = storedValue + 1;"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")},{identifier:"localValue",type:{kind:"uint",bits:256},pointer:{location:"stack",slot:0},declaration:e("let localValue")}]})},{operation:{mnemonic:"PUSH0"},context:({findSourceRange:e})=>({code:e("storedValue ="),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")},{identifier:"localValue",type:{kind:"uint",bits:256},pointer:{location:"stack",slot:1},declaration:e("let localValue")}]})},{operation:{mnemonic:"SSTORE"},context:({findSourceRange:e})=>({code:e("storedValue = localValue;"),variables:[{identifier:"storedValue",type:{kind:"uint",bits:256},pointer:{location:"storage",slot:0},declaration:e("[0] storedValue: uint256")}]})},{operation:{mnemonic:"JUMPDEST"},context:({findSourceRange:e})=>({code:e("return;"),remark:"skip to here if not enough paid"})}],children:[(0,o.jsxs)(t.p,{children:["This page helps illustrate the program schema's\n",(0,o.jsx)(t.a,{href:"/spec/program/concepts",children:"key concepts"})," by offering a fictional\npseudo-code example and its hypothetical compiled program."]}),(0,o.jsx)(t.p,{children:"Assume this fictional [somewhat] high-level language expects one contract per\nsource file, where each contract defines its storage layout, high-level logic,\nand other metadata as top-level statements or blocks."}),(0,o.jsx)(t.p,{children:"The following source code might be used to define a contract that\nincrements a state variable if the caller pays at least 1 finney (0.001 ETH)."}),(0,o.jsx)(S,{})]})]})}function R(e={}){const{wrapper:t}={...(0,i.a)(),...e.components};return t?(0,o.jsx)(t,{...e,children:(0,o.jsx)(C,{...e})}):C(e)}}}]);