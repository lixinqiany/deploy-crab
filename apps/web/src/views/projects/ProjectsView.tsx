import { Button, Card } from 'antd';
import { Page } from '@deploy-crab/ui/layout/page/Page';

export const ProjectsView = () => (
  <Page title="项目" extra={<Button type="primary">新建项目</Button>}>
    <Card>项目页面（占位）</Card>
  </Page>
);
