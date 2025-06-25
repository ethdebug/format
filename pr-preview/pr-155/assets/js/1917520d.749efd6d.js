"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[1571],{99156:(e,s,t)=>{t.r(s),t.d(s,{assets:()=>y,contentTitle:()=>l,default:()=>x,frontMatter:()=>h,metadata:()=>m,toc:()=>f});var n=t(52322),a=t(45392),r=t(45850),i=t(65332),o=t(77336),p=t(82009),c=t(55425),d=t.n(c);const h={sidebar_position:6},l="Base schema",m={id:"type/base",title:"Base schema",description:"The schema on this page is extended by other, more specific schemas as part of",source:"@site/spec/type/base.mdx",sourceDirName:"type",slug:"/type/base",permalink:"/format/pr-preview/pr-155/spec/type/base",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/spec/type/base.mdx",tags:[],version:"current",sidebarPosition:6,frontMatter:{sidebar_position:6},sidebar:"docsSidebar",previous:{title:"function",permalink:"/format/pr-preview/pr-155/spec/type/complex/function"},next:{title:"Overview",permalink:"/format/pr-preview/pr-155/spec/pointer/overview"}},y={},f=[{value:"Differences from <strong>ethdebug/format/type</strong>",id:"differences-from-ethdebugformattype",level:2},{value:"Unconstrained <code>kind</code> field",id:"unconstrained-kind-field",level:3},{value:"The <code>class</code> field is always optional",id:"the-class-field-is-always-optional",level:3},{value:"A complex base type <code>contains</code> other base types",id:"a-complex-base-type-contains-other-base-types",level:3},{value:"Base type wrapper schema",id:"base-type-wrapper-schema",level:4},{value:"Full base schema",id:"full-base-schema",level:2},{value:"Example schema extensions for particular types",id:"example-schema-extensions-for-particular-types",level:2}];function u(e){const s={a:"a",admonition:"admonition",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",h4:"h4",p:"p",strong:"strong",...(0,a.a)(),...e.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(s.h1,{id:"base-schema",children:"Base schema"}),"\n",(0,n.jsxs)(s.admonition,{type:"warning",children:[(0,n.jsxs)(s.p,{children:["The schema on this page is extended by other, more specific schemas as part of\nthe larger ",(0,n.jsx)(s.strong,{children:"ethdebug/format"})," specification. These other schemas specify the\nrepresentation of many common kinds of types (e.g. including signed/unsigned\nintegers, arrays, structs, mappings, etc.). In order to adhere to this format\nfully, compilers that represent known types ",(0,n.jsx)(s.strong,{children:"should"})," do so with the\nappropriate more-specific schema."]}),(0,n.jsxs)(s.p,{children:["Please see the ",(0,n.jsx)(s.a,{href:"/spec/type",children:(0,n.jsx)(s.strong,{children:"ethdebug/format/type"})})," schema for representing\nthese supported types."]})]}),"\n",(0,n.jsxs)(s.p,{children:["This format defines the ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type/base"})," schema for\nrepresenting data types from high-level languages. These types may be\nuser-defined or supplied as native data types in a language. This schema\naffords the representation of complex/parametric types, whose definition\ncomposes other types (e.g., arrays and structs, which contain at least one\nunderlying type)."]}),"\n",(0,n.jsxs)(s.p,{children:["This base schema itself is designed to be extended by other schemas in this\nformat, namely ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type"}),". It serves to specify what is\n",(0,n.jsx)(s.em,{children:"minimally necessary"})," for a type to be a valid representation (i.e., all type\nrepresentations ",(0,n.jsx)(s.strong,{children:"must"})," adhere to at least this base schema)."]}),"\n",(0,n.jsx)(i.Z,{toc:f}),"\n",(0,n.jsxs)(s.h2,{id:"differences-from-ethdebugformattype",children:["Differences from ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type"})]}),"\n",(0,n.jsx)(s.p,{children:"This base schema defines the structure of a type representation without respect\nto any known kind of type."}),"\n",(0,n.jsxs)(s.h3,{id:"unconstrained-kind-field",children:["Unconstrained ",(0,n.jsx)(s.code,{children:"kind"})," field"]}),"\n",(0,n.jsxs)(s.p,{children:["As described in key concepts\n",(0,n.jsxs)(s.a,{href:"/spec/type/concepts#types-are-organized-by-kind",children:["Types are organized by ",(0,n.jsx)(s.code,{children:"kind"})]}),"\nand\n",(0,n.jsx)(s.a,{href:"/spec/type/concepts#known-vs-unknown-kinds",children:"Known vs. unknown kinds"}),",\n",(0,n.jsx)(s.strong,{children:"ethdebug/format/type"})," imposes constraints on type representations' ",(0,n.jsx)(s.code,{children:"kind"}),"\nfield. This base schema makes no restriction on the value of this field\n(other than it ",(0,n.jsx)(s.strong,{children:"must"})," be defined and ",(0,n.jsx)(s.strong,{children:"must"})," be a string)."]}),"\n",(0,n.jsxs)(s.admonition,{title:"Note to implementers",type:"note",children:[(0,n.jsxs)(s.p,{children:["The primary purpose for the ",(0,n.jsx)(s.code,{children:"kind"})," field is to discriminate type objects\ninto the appropriate corresponding subschema for a well-understood family of type.\nAlthough ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type/base"})," does not impose any constraints on\nobjects based on the ",(0,n.jsx)(s.code,{children:"kind"})," field, it includes this field so as to encourage\nthe one-to-one pairing between values for this field and corresponding\nsubschemas."]}),(0,n.jsxs)(s.p,{children:["When extending this schema, there ",(0,n.jsx)(s.strong,{children:"should"})," exist exactly one corresponding\nschema for each ",(0,n.jsx)(s.code,{children:"kind"})," value."]})]}),"\n",(0,n.jsxs)(s.h3,{id:"the-class-field-is-always-optional",children:["The ",(0,n.jsx)(s.code,{children:"class"})," field is always optional"]}),"\n",(0,n.jsxs)(s.p,{children:["Although ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type"})," does not require the ",(0,n.jsx)(s.code,{children:"class"})," field to be\ndefined for known types, it does require this field for representations of\nunknown types."]}),"\n",(0,n.jsxs)(s.p,{children:["The ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type/base"})," schema does not ever require this field."]}),"\n",(0,n.jsxs)(s.h3,{id:"a-complex-base-type-contains-other-base-types",children:["A complex base type ",(0,n.jsx)(s.code,{children:"contains"})," other base types"]}),"\n",(0,n.jsxs)(s.p,{children:["As described in key concept\n",(0,n.jsx)(s.a,{href:"/spec/type/concepts#elementary-vs-complex-types",children:"Elementary vs. complex types"}),",\nthis format allows the representation of types whose definition\nincludes other types. Both the primary schema and this base schema\nrequire type composition to be represented via complex types' ",(0,n.jsx)(s.code,{children:"contains"})," field."]}),"\n",(0,n.jsxs)(s.p,{children:["These two schemas differ by which type schema this field is\npermitted to compose. Naturally, ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type"}),"'s ",(0,n.jsx)(s.code,{children:"contains"})," field\ncomposes ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type"})," representations, and\n",(0,n.jsx)(s.strong,{children:"ethdebug/format/type/base"}),"'s ",(0,n.jsx)(s.code,{children:"contains"})," field composes\n",(0,n.jsx)(s.strong,{children:"ethdebug/format/type/base"})," representations."]}),"\n",(0,n.jsxs)(s.p,{children:["As a result of this, ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type/base"})," defines its own type wrapper\nschema."]}),"\n",(0,n.jsx)(s.h4,{id:"base-type-wrapper-schema",children:"Base type wrapper schema"}),"\n",(0,n.jsx)(r.Z,{schema:{id:"schema:ethdebug/format/type/base"},pointer:"#/$defs/TypeWrapper"}),"\n",(0,n.jsx)(s.h2,{id:"full-base-schema",children:"Full base schema"}),"\n",(0,n.jsx)(r.Z,{schema:{id:"schema:ethdebug/format/type/base"}}),"\n",(0,n.jsx)(s.h2,{id:"example-schema-extensions-for-particular-types",children:"Example schema extensions for particular types"}),"\n",(0,n.jsxs)(s.p,{children:["These examples show valid schemas that extend ",(0,n.jsx)(s.strong,{children:"ethdebug/format/types/base"}),"\nfor particular kinds of types."]}),"\n",(0,n.jsx)(s.p,{children:(0,n.jsxs)(s.em,{children:[(0,n.jsx)(s.strong,{children:"Note"}),": These are just examples and may not\ncorrespond to the canonical ",(0,n.jsx)(s.strong,{children:"ethdebug/format/type"})," schema."]})}),"\n",(0,n.jsxs)(o.default,{defaultValue:"uint",values:[{value:"uint",label:"Example uint type schema"},{value:"array",label:"Example array type schema"},{value:"mapping",label:"Example mapping type schema"}],children:[(0,n.jsx)(p.default,{value:"uint",children:(0,n.jsx)(r.Z,{schema:d()`
        $schema: "https://json-schema.org/draft/2020-12/schema"
        type: object
        properties:
          class:
            type: string
            const: elementary
          kind:
            type: string
            const: uint
          bits:
            type: number
            multipleOf: 8
            minimum: 8
            maximum: 256
        required:
          - kind
          - bits
        examples:
          - kind: uint
            bits: 64
      `})}),(0,n.jsx)(p.default,{value:"array",children:(0,n.jsx)(r.Z,{schema:d()`
        $schema: "https://json-schema.org/draft/2020-12/schema"
        type: object
        properties:
          class:
            type: string
            const: complex
          kind:
            type: string
            const: array
          contains:
            type: object
            properties:
              type:
                $ref: "schema:ethdebug/format/type/base"
            required:
              - type
        required:
          - kind
          - contains
        examples:
          - kind: array
            contains:
              type:
                kind: string
        description:
          An example schema for array types. See example value for representing
          an array of strings (\`string[]\`).
      `})}),(0,n.jsx)(p.default,{value:"mapping",children:(0,n.jsx)(r.Z,{schema:d()`
        $schema: "https://json-schema.org/draft/2020-12/schema"
        title: Example mapping type schema
        type: object
        properties:
          class:
            type: string
            const: complex
          kind:
            type: string
            const: array
          contains:
            type: object
            properties:
              key:
                type: object
                properties:
                  type:
                    $ref: "schema:ethdebug/format/type/base"
                required:
                  - type
              value:
                type: object
                properties:
                  type:
                    $ref: "schema:ethdebug/format/type/base"
                required:
                  - type
            required:
              - key
              - value
        required:
          - kind
          - contains
        examples:
          - kind: mapping
            contains:
              key:
                type:
                  kind: address
                  payable: true
              value:
                type:
                  kind: uint
                  bits: 256
        description:
          An example schema for mapping types. See example value for a mapping
          from an \`address payable\` to a \`uint256\`, adhering to this
          example schema.
      `})})]})]})}function x(e={}){const{wrapper:s}={...(0,a.a)(),...e.components};return s?(0,n.jsx)(s,{...e,children:(0,n.jsx)(u,{...e})}):u(e)}}}]);