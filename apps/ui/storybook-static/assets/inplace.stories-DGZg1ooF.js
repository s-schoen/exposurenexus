import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{r as i,t as a}from"./button-CUM85oiu.js";import{n as o,t as s}from"./badge-GbGZuCVS.js";import{n as c,t as l}from"./inplace-BV_CHzXk.js";function u(e){let[t,n]=(0,d.useState)(e.value);return(0,d.useEffect)(()=>{n(e.value)},[e.value]),(0,f.jsx)(`div`,{className:`w-96 rounded-xl border border-border/70 bg-card p-5`,children:(0,f.jsx)(l,{value:t,editElement:e.mode===`select`?{type:`select`,options:[{label:`Active`,value:`active`},{label:`Confirmed`,value:`confirmed`},{label:`Risk accepted`,value:`risk-accepted`}]}:e.mode===`custom`?{type:`custom`,hideActions:!0,render:({value:e,onChange:t,onCommit:n,onCancel:r})=>(0,f.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,f.jsx)(a,{type:`button`,size:`sm`,variant:e===`low`?`default`:`outline`,onClick:()=>t(`low`),children:`Low`}),(0,f.jsx)(a,{type:`button`,size:`sm`,variant:e===`high`?`default`:`outline`,onClick:()=>t(`high`),children:`High`}),(0,f.jsx)(a,{type:`button`,size:`sm`,onClick:()=>n(e),children:`Save`}),(0,f.jsx)(a,{type:`button`,size:`sm`,variant:`ghost`,onClick:r,children:`Cancel`})]})}:{type:`input`},editOnClick:e.editOnClick,showEditIcon:e.showEditIcon,displayElement:t=>e.mode===`select`?(0,f.jsx)(s,{variant:`outline`,className:`rounded-full`,children:t}):(0,f.jsx)(`span`,{children:t}),onSave:async t=>{n(t),await e.onSave(t)}})})}var d,f,p,m,h,g,_,v,y,b,x,S;t((()=>{d=e(n(),1),c(),o(),i(),f=r(),{expect:p,fn:m,userEvent:h,within:g}=__STORYBOOK_MODULE_TEST__,_={title:`Components/Inplace`,component:u,parameters:{layout:`centered`},args:{value:`web-01`,mode:`input`,editOnClick:!1,showEditIcon:!0,onSave:m()},argTypes:{mode:{control:`radio`,options:[`input`,`select`,`custom`]}},render:e=>(0,f.jsx)(u,{...e})},v={play:async({canvasElement:e})=>{let t=g(e);await h.click(await t.findByRole(`button`)),await p(await t.findByRole(`textbox`)).toHaveValue(`web-01`)}},y={args:{editOnClick:!0,showEditIcon:!1}},b={args:{value:`active`,mode:`select`}},x={args:{value:`low`,mode:`custom`,editOnClick:!0,showEditIcon:!1}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button"));
    await expect(await canvas.findByRole("textbox")).toHaveValue("web-01");
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    editOnClick: true,
    showEditIcon: false
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    value: "active",
    mode: "select"
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    value: "low",
    mode: "custom",
    editOnClick: true,
    showEditIcon: false
  }
}`,...x.parameters?.docs?.source}}},S=[`InputEdit`,`ClickToEdit`,`SelectEdit`,`CustomEdit`]}))();export{y as ClickToEdit,x as CustomEdit,v as InputEdit,b as SelectEdit,S as __namedExportsOrder,_ as default};