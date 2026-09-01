import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{n as i,s as a}from"./asset-custom-field-B9G1olyA.js";import{n as o,t as s}from"./asset-custom-field-form-BwTUXFdq.js";function c(e){let[t,n]=(0,l.useState)(),r=async t=>{n(t),await e.onSubmit(t)};return(0,u.jsxs)(`div`,{className:`w-full max-w-2xl space-y-4`,children:[(0,u.jsx)(s,{...e,onSubmit:r}),t?(0,u.jsxs)(`div`,{className:`rounded-xl border border-border/70 bg-card p-4`,children:[(0,u.jsx)(`p`,{className:`text-sm font-medium text-foreground`,children:`Last submitted`}),(0,u.jsx)(`pre`,{className:`mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground`,children:JSON.stringify(t,null,2)})]}):null]})}var l,u,d,f,p,m,h,g,_,v,y,b,x;t((()=>{l=e(n(),1),a(),o(),u=r(),{expect:d,fn:f,userEvent:p,within:m}=__STORYBOOK_MODULE_TEST__,h={title:`Resources/Custom Fields/Form`,component:s,parameters:{layout:`padded`},args:{mode:`create`,onSubmit:f(async e=>{await new Promise(e=>setTimeout(e,300))}),onCancel:f()},render:e=>(0,u.jsx)(c,{...e})},g={},_={args:{defaultValues:{name:`Priority`,key:`priority`,type:i.Number,required:!0,defaultValue:`3`}}},v={args:{defaultValues:{name:`Environment`,key:`environment`,type:i.Select,required:!0,defaultValue:`production`,options:[{value:`production`,label:`Production`},{value:`staging`,label:`Staging`}]}}},y={args:{mode:`edit`,defaultValues:{name:`Environment`,key:`environment`,type:i.Select,required:!0,defaultValue:`production`,options:[{value:`production`,label:`Production`},{value:`staging`,label:`Staging`}]}}},b={args:{defaultValues:{type:i.Select,required:!0,options:[{value:`production`,label:`Production`},{value:`production`,label:`Production duplicate`}]}},play:async({canvasElement:e})=>{let t=m(e);await p.click(await t.findByRole(`button`,{name:/create custom field/i})),await d(await t.findAllByRole(`alert`)).not.toHaveLength(0)}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    defaultValues: {
      name: "Priority",
      key: "priority",
      type: AssetCustomFieldType.Number,
      required: true,
      defaultValue: "3"
    }
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    defaultValues: {
      name: "Environment",
      key: "environment",
      type: AssetCustomFieldType.Select,
      required: true,
      defaultValue: "production",
      options: [{
        value: "production",
        label: "Production"
      }, {
        value: "staging",
        label: "Staging"
      }]
    }
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    mode: "edit",
    defaultValues: {
      name: "Environment",
      key: "environment",
      type: AssetCustomFieldType.Select,
      required: true,
      defaultValue: "production",
      options: [{
        value: "production",
        label: "Production"
      }, {
        value: "staging",
        label: "Staging"
      }]
    }
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    defaultValues: {
      type: AssetCustomFieldType.Select,
      required: true,
      options: [{
        value: "production",
        label: "Production"
      }, {
        value: "production",
        label: "Production duplicate"
      }]
    }
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", {
      name: /create custom field/i
    }));
    await expect(await canvas.findAllByRole("alert")).not.toHaveLength(0);
  }
}`,...b.parameters?.docs?.source}}},x=[`CreateText`,`CreateNumber`,`CreateSelect`,`EditSelect`,`ValidationErrors`]}))();export{_ as CreateNumber,v as CreateSelect,g as CreateText,y as EditSelect,b as ValidationErrors,x as __namedExportsOrder,h as default};