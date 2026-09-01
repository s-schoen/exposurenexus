import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{c as i,d as a,p as o}from"./common-YwcRYf10.js";import{a as s,t as c}from"./user-label-C5Kt167_.js";function l({scenario:e,user:t,userId:n,className:r,emptyLabel:i,unknownLabel:s,variant:l}){let m=(0,u.useMemo)(()=>[f,p],[]),h=(0,u.useMemo)(()=>{let t=new o({defaultOptions:{queries:{retry:!1}}});return e===`success`&&t.setQueryData([`users`],m),e===`unknown`&&t.setQueryData([`users`],[]),t},[e,m]),[g,_]=(0,u.useState)(e!==`loading`);return(0,u.useLayoutEffect)(()=>{if(e!==`loading`){_(!0);return}let t=globalThis.fetch;return globalThis.fetch=async(e,n)=>(e instanceof Request?e.url:String(e)).endsWith(`/api/users`)?await new Promise(()=>{}):t(e,n),_(!0),()=>{globalThis.fetch=t}},[e]),(0,u.useEffect)(()=>{h.clear(),e===`success`&&h.setQueryData([`users`],m),e===`unknown`&&h.setQueryData([`users`],[])},[h,e,m]),g?(0,d.jsx)(a,{client:h,children:(0,d.jsx)(`div`,{className:`w-64 rounded-xl border border-border/70 bg-card p-4`,children:(0,d.jsx)(`div`,{className:`min-h-5`,children:(0,d.jsx)(c,{user:t,userId:n,className:r,emptyLabel:i,unknownLabel:s,variant:l})})})}):null}var u,d,f,p,m,h,g,_,v,y,b,x,S,C;t((()=>{i(),u=e(n(),1),s(),d=r(),f={id:`11111111-1111-4111-8111-111111111111`,username:`alice`,displayName:`Alice Example`,email:`alice@example.com`,enabled:!0,roleIds:[]},p={id:`22222222-2222-4222-8222-222222222222`,username:`disabled`,displayName:`Taylor Example`,email:`disabled@example.com`,enabled:!1,roleIds:[]},m={title:`Components/UserLabel`,component:c,parameters:{layout:`padded`},argTypes:{scenario:{control:`radio`,options:[`success`,`loading`,`unknown`]},variant:{control:`radio`,options:[`text`,`chip`]}},args:{userId:f.id,scenario:`success`,variant:`text`},render:e=>(0,d.jsx)(l,{...e})},h={},g={args:{user:f,userId:void 0}},_={args:{variant:`chip`}},v={args:{userId:null,emptyLabel:`No Owner`}},y={args:{userId:`33333333-3333-4333-8333-333333333333`,scenario:`unknown`,unknownLabel:`Unknown Owner`}},b={args:{userId:p.id}},x={args:{userId:`44444444-4444-4444-8444-444444444444`,scenario:`loading`}},S={render:e=>(0,d.jsx)(`div`,{className:`dark rounded-2xl bg-background p-6`,children:(0,d.jsx)(l,{...e})})},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    user: alice,
    userId: undefined
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    variant: "chip"
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    userId: null,
    emptyLabel: "No Owner"
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    userId: "33333333-3333-4333-8333-333333333333",
    scenario: "unknown",
    unknownLabel: "Unknown Owner"
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    userId: disabledUser.id
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    userId: "44444444-4444-4444-8444-444444444444",
    scenario: "loading"
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  render: args => <div className="dark rounded-2xl bg-background p-6">
      <UserLabelStoryShell {...args} />
    </div>
}`,...S.parameters?.docs?.source}}},C=[`Default`,`ResolvedProfile`,`Chip`,`NoUser`,`UnknownUser`,`DisabledUser`,`Loading`,`DarkSurface`]}))();export{_ as Chip,S as DarkSurface,h as Default,b as DisabledUser,x as Loading,v as NoUser,g as ResolvedProfile,y as UnknownUser,C as __namedExportsOrder,m as default};