"use client";

import { Form, Input, Button, Alert, Typography } from "antd";
import { useLogin } from "../hooks/useLogin";

const { Title } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginForm() {
  const { login, loading, error } = useLogin();

  function handleFinish(values: LoginFormValues) {
    login(values.email, values.password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <Title level={3} className="text-center">
          เข้าสู่ระบบ LAW-AI
        </Title>
        {error && <Alert type="error" message={error} showIcon className="mb-4" />}
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item
            name="email"
            label="อีเมล"
            rules={[{ required: true, message: "กรุณากรอกอีเมล" }]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="รหัสผ่าน"
            rules={[{ required: true, message: "กรุณากรอกรหัสผ่าน" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              เข้าสู่ระบบ
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
