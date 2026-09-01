import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{c as i,d as a}from"./common-YwcRYf10.js";import{o,t as s}from"./storybook-fixtures-FiAZrqXQ.js";import{i as c,r as l}from"./routeTree.gen-C2YN_l7l.js";import{a as u,i as d,n as f}from"./storybook-utils-ByWtnJxJ.js";function p({scenario:e,onChange:t}){let n=e===`empty`?[]:s,r=(0,m.useMemo)(()=>{let t=d();return e!==`loading`&&t.setQueryData([`assets`],n),t},[n,e]),[i,o]=(0,m.useState)(e!==`loading`);return(0,m.useLayoutEffect)(()=>{let t=globalThis.fetch;return globalThis.fetch=async(r,i)=>(r instanceof Request?r.url:String(r)).endsWith(`/api/assets`)?e===`loading`?await new Promise(()=>{}):f(n):t(r,i),o(!0),()=>{globalThis.fetch=t}},[n,e]),i?(0,h.jsx)(a,{client:r,children:(0,h.jsx)(`div`,{className:`w-80`,children:(0,h.jsx)(l,{onChange:t})})}):null}var m,h,g,_,v,y,b,x,S,C,w;t((()=>{i(),m=e(n(),1),c(),o(),u(),h=r(),{expect:g,fn:_,userEvent:v,within:y}=__STORYBOOK_MODULE_TEST__,b={title:`Resources/Assets/Combobox`,component:p,parameters:{layout:`centered`},args:{scenario:`loaded`,onChange:_()},argTypes:{scenario:{control:`radio`,options:[`loaded`,`empty`,`loading`]}},render:e=>(0,h.jsx)(p,{...e})},x={play:async({args:e,canvasElement:t})=>{let n=y(t),r=y(t.ownerDocument.body);await v.click(await n.findByRole(`combobox`)),await v.click(await r.findByText(`web-01`)),await g(e.onChange).toHaveBeenCalledWith(s[0])}},S={args:{scenario:`empty`}},C={args:{scenario:`loading`}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("combobox"));
    await userEvent.click(await page.findByText("web-01"));
    await expect(args.onChange).toHaveBeenCalledWith(STORY_ASSETS[0]);
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "empty"
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "loading"
  }
}`,...C.parameters?.docs?.source}}},w=[`Loaded`,`Empty`,`Loading`]}))();export{S as Empty,x as Loaded,C as Loading,w as __namedExportsOrder,b as default};