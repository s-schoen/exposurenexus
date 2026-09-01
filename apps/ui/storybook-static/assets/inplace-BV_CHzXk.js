import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{r as i,t as a}from"./button-CUM85oiu.js";import{n as o,t as s}from"./input-CKApMF24.js";import{n as c,t as l}from"./utils-B_k98QvR.js";import{a as u,i as d,n as f,s as p,t as m}from"./select-CngMEWun.js";import{S as h,n as g,t as _,tt as v}from"./lucide-react-gLHBi0xA.js";function y({value:e,onSave:t,displayElement:n,editElement:r={type:`input`},editOnClick:i=!1,showEditIcon:o=!0,onEditingChange:c}){let[p,_]=(0,b.useState)(!1),[y,S]=(0,b.useState)(e),[C,w]=(0,b.useState)(!1),[T,E]=(0,b.useState)(!1),D=(0,b.useRef)(null);(0,b.useEffect)(()=>{c?.(p)},[p,c]);let O=(0,b.useCallback)(()=>{S(e),_(!0),E(!0),setTimeout(()=>D.current?.focus(),0)},[e]),k=(0,b.useCallback)(()=>{E(!1),_(!1),S(e)},[e]),A=(0,b.useCallback)(async n=>{if(y===e&&!n){_(!1);return}try{n?await t(n):await t(y)}finally{_(!1),E(!1)}},[y,e,t]),j=e=>{e.key===`Enter`&&A(),e.key===`Escape`&&k()};function M(){return n?n(e):(0,x.jsx)(`span`,{children:String(e)})}function N(){if(r.type===`custom`)return r.render({value:y,onChange:S,onCommit:A,onCancel:k});if(r.type===`select`){let t=r.options.find(e=>e.value===y)?.label??String(y);return(0,x.jsxs)(m,{open:T,onOpenChange:E,value:String(y),onValueChange:t=>{let n=typeof e==`number`?Number(t):t;S(n),A(n)},children:[(0,x.jsx)(u,{className:`h-7 min-w-32 text-sm`,children:(0,x.jsx)(`span`,{className:`min-w-0 flex-1 truncate text-left`,children:t})}),(0,x.jsx)(f,{children:r.options.map(e=>(0,x.jsx)(d,{value:String(e.value),children:e.label},String(e.value)))})]})}return(0,x.jsx)(s,{ref:D,type:r.inputType??`text`,value:String(y),onChange:t=>{let n=t.target.value;S(typeof e==`number`?Number(n):n)},onKeyDown:j,className:`h-7 w-auto min-w-32 py-0 text-sm`})}function P(){return p&&r.type===`custom`&&r.hideActions?null:(0,x.jsx)(`div`,{className:`flex items-center gap-1`,children:p?(0,x.jsxs)(`div`,{className:`flex items-center gap-2`,children:[r.type!==`select`&&(0,x.jsx)(a,{onClick:()=>A(),size:`icon-sm`,variant:`ghost`,children:(0,x.jsx)(v,{})}),(0,x.jsx)(a,{onClick:()=>k(),size:`icon-sm`,variant:`ghost`,children:(0,x.jsx)(g,{})})]}):(0,x.jsx)(a,{onClick:()=>O(),size:`icon-sm`,variant:`ghost`,className:C&&o?`opacity-100`:`opacity-0`,children:(0,x.jsx)(h,{})})})}return(0,x.jsxs)(`div`,{className:l(`flex`,`items-center`,`gap-4`,`min-w-36`,{"cursor-pointer":i}),onMouseEnter:()=>w(!0),onMouseLeave:()=>w(!1),children:[(0,x.jsx)(`div`,{onClick:i?O:void 0,children:p?N():M()}),P()]})}var b,x,S=t((()=>{b=e(n(),1),_(),i(),p(),o(),c(),x=r(),y.__docgenInfo={description:``,methods:[],displayName:`Inplace`,props:{value:{required:!0,tsType:{name:`T`},description:``},onSave:{required:!0,tsType:{name:`signature`,type:`function`,raw:`(value: T) => void | Promise<void>`,signature:{arguments:[{type:{name:`T`},name:`value`}],return:{name:`union`,raw:`void | Promise<void>`,elements:[{name:`void`},{name:`Promise`,elements:[{name:`void`}],raw:`Promise<void>`}]}}},description:``},displayElement:{required:!1,tsType:{name:`signature`,type:`function`,raw:`(value: T) => ReactNode`,signature:{arguments:[{type:{name:`T`},name:`value`}],return:{name:`ReactNode`}}},description:``},editElement:{required:!1,tsType:{name:`union`,raw:`| { type: "input"; inputType?: HTMLInputTypeAttribute }
| {
    type: "select"
    options: Array<{ label: string; value: T }>
  }
| {
    type: "custom"
    hideActions?: boolean
    render: (props: {
      value: T
      onChange: (value: T) => void
      onCommit: (value?: T) => void
      onCancel: () => void
    }) => ReactNode
  }`,elements:[{name:`signature`,type:`object`,raw:`{ type: "input"; inputType?: HTMLInputTypeAttribute }`,signature:{properties:[{key:`type`,value:{name:`literal`,value:`"input"`,required:!0}},{key:`inputType`,value:{name:`HTMLInputTypeAttribute`,required:!1}}]}},{name:`signature`,type:`object`,raw:`{
  type: "select"
  options: Array<{ label: string; value: T }>
}`,signature:{properties:[{key:`type`,value:{name:`literal`,value:`"select"`,required:!0}},{key:`options`,value:{name:`Array`,elements:[{name:`signature`,type:`object`,raw:`{ label: string; value: T }`,signature:{properties:[{key:`label`,value:{name:`string`,required:!0}},{key:`value`,value:{name:`T`,required:!0}}]}}],raw:`Array<{ label: string; value: T }>`,required:!0}}]}},{name:`signature`,type:`object`,raw:`{
  type: "custom"
  hideActions?: boolean
  render: (props: {
    value: T
    onChange: (value: T) => void
    onCommit: (value?: T) => void
    onCancel: () => void
  }) => ReactNode
}`,signature:{properties:[{key:`type`,value:{name:`literal`,value:`"custom"`,required:!0}},{key:`hideActions`,value:{name:`boolean`,required:!1}},{key:`render`,value:{name:`signature`,type:`function`,raw:`(props: {
  value: T
  onChange: (value: T) => void
  onCommit: (value?: T) => void
  onCancel: () => void
}) => ReactNode`,signature:{arguments:[{type:{name:`signature`,type:`object`,raw:`{
  value: T
  onChange: (value: T) => void
  onCommit: (value?: T) => void
  onCancel: () => void
}`,signature:{properties:[{key:`value`,value:{name:`T`,required:!0}},{key:`onChange`,value:{name:`signature`,type:`function`,raw:`(value: T) => void`,signature:{arguments:[{type:{name:`T`},name:`value`}],return:{name:`void`}},required:!0}},{key:`onCommit`,value:{name:`signature`,type:`function`,raw:`(value?: T) => void`,signature:{arguments:[{type:{name:`T`},name:`value`}],return:{name:`void`}},required:!0}},{key:`onCancel`,value:{name:`signature`,type:`function`,raw:`() => void`,signature:{arguments:[],return:{name:`void`}},required:!0}}]}},name:`props`}],return:{name:`ReactNode`}},required:!0}}]}}]},description:``,defaultValue:{value:`{ type: "input" }`,computed:!1}},editOnClick:{required:!1,tsType:{name:`boolean`},description:``,defaultValue:{value:`false`,computed:!1}},showEditIcon:{required:!1,tsType:{name:`boolean`},description:``,defaultValue:{value:`true`,computed:!1}},onEditingChange:{required:!1,tsType:{name:`signature`,type:`function`,raw:`(editing: boolean) => void`,signature:{arguments:[{type:{name:`boolean`},name:`editing`}],return:{name:`void`}}},description:``}}}}));export{S as n,y as t};