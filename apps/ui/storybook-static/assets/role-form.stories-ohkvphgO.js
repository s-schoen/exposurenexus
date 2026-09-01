import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{i,n as a,r as o}from"./role-fixtures-9ejvWuBf.js";import{n as s,r as c,t as l}from"./role-form-C5bgreLh.js";function u(e){let[t,n]=(0,d.useState)(),r=async t=>{n(t),await e.onSubmit(t)};return(0,f.jsxs)(`div`,{className:`w-full max-w-2xl space-y-4`,children:[(0,f.jsx)(l,{...e,onSubmit:r}),t?(0,f.jsxs)(`div`,{className:`rounded-xl border border-border/70 bg-card p-4`,children:[(0,f.jsx)(`p`,{className:`text-sm font-medium text-foreground`,children:`Last submitted`}),(0,f.jsx)(`pre`,{className:`mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground`,children:JSON.stringify(t,null,2)})]}):null]})}var d,f,p,m,h,g,_,v,y,b,x,S,C,w;t((()=>{d=e(n(),1),c(),i(),f=r(),{expect:p,fn:m,userEvent:h,within:g}=__STORYBOOK_MODULE_TEST__,_=s(o),v={title:`Resources/Roles/Form`,component:l,parameters:{layout:`padded`},args:{mode:`create`,availablePermissions:_,onSubmit:m(async e=>{await new Promise(e=>setTimeout(e,300))}),onCancel:m()},render:e=>(0,f.jsx)(u,{...e})},y={},b={args:{mode:`edit`,defaultValues:{name:a.name,permissions:a.permissions}}},x={args:{defaultValues:{name:`no-access`,permissions:[]}}},S={play:async({canvasElement:e})=>{let t=g(e);await h.click(await t.findByRole(`button`,{name:/create role/i})),await p(await t.findAllByRole(`alert`)).not.toHaveLength(0)}},C={args:{defaultValues:{name:`security-analyst`},onSubmit:m(async e=>{await new Promise(e=>setTimeout(e,4e3))})},play:async({canvasElement:e,args:t})=>{let n=g(e);await h.click(await n.findByRole(`button`,{name:/create role/i})),await p(t.onSubmit).toHaveBeenCalled()}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    mode: "edit",
    defaultValues: {
      name: CUSTOM_AUDITOR_ROLE.name,
      permissions: CUSTOM_AUDITOR_ROLE.permissions
    }
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    defaultValues: {
      name: "no-access",
      permissions: []
    }
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", {
      name: /create role/i
    }));
    await expect(await canvas.findAllByRole("alert")).not.toHaveLength(0);
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    defaultValues: {
      name: "security-analyst"
    },
    onSubmit: fn(async _values => {
      await new Promise(resolve => setTimeout(resolve, 4000));
    })
  },
  play: async ({
    canvasElement,
    args
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", {
      name: /create role/i
    }));
    await expect(args.onSubmit).toHaveBeenCalled();
  }
}`,...C.parameters?.docs?.source}}},w=[`Create`,`EditPrefilled`,`ZeroPermissions`,`ValidationErrors`,`Submitting`]}))();export{y as Create,b as EditPrefilled,C as Submitting,S as ValidationErrors,x as ZeroPermissions,w as __namedExportsOrder,v as default};