# 🚀 HetznerDock

A simple management panel for Hetzner Cloud ☁️. Manage your servers and resources through an easy-to-use web interface.

## ✨ Features

* Manage multiple Hetzner Cloud projects 📂
* Create, power on/off, reboot, and delete servers 🔌
* View available images and server types 🖼️
* Track actions with built-in logging 📝
* Simple authentication system 🔐
* Docker support for easy installation 🐳

## ⚡ Quick Install with Docker

```bash
# Create a volume for data storage
docker volume create hetznerdock_data

# Run the container
docker run -d \
  --restart always \
  --name hetznerdock \
  -p 8001:8000 \
  -v hetznerdock_data:/app/data \
  -e SECRET_KEY=your_custom_secret_key \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=changeme \
  mahdigraph/hetznerdock:latest

# Access at http://localhost:8001 🌐
```

### 🔑 Default Login

* **Username**: `admin`
* **Password**: `changeme`

**Important**: 🔄 Please change the default password after logging in.

## ⚙️ Configuration

| Variable                      | Description                                     | Default       |
| ----------------------------- | ----------------------------------------------- | ------------- |
| `SECRET_KEY`                  | JWT token secret key (NOT your Hetzner API key) | `default_key` |
| `ADMIN_USERNAME`              | Admin username                                  | `admin`       |
| `ADMIN_PASSWORD`              | Admin password                                  | `changeme`    |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Login session duration                          | `30`          |
| `LOG_MAX_ENTRIES`             | Maximum log entries per project                 | `1000`        |

> 💡 Note: API keys for Hetzner are added within the application after login.

## 🔒 Security Tips

* Change the default admin password 🛡️
* Use a strong random string for `SECRET_KEY` 🔑
* Consider running behind a reverse proxy with HTTPS 🔐

## 📜 License

MIT License

---

# داکر هتزنر ⚙️

یک پنل مدیریت ساده برای سرویس ابری هتزنر ☁️. مدیریت سرورها و منابع از طریق یک رابط کاربری آسان.

## ✨ امکانات

* مدیریت چندین پروژه هتزنر کلود 📂
* ایجاد، روشن/خاموش کردن، راه‌اندازی مجدد و حذف سرورها 🔌
* مشاهده تصاویر و انواع سرورهای موجود 🖼️
* ثبت عملیات‌ها با سیستم لاگ داخلی 📝
* سیستم احراز هویت ساده 🔐
* پشتیبانی از داکر برای نصب آسان 🐳

## ⚡ نصب سریع با داکر

```bash
# ایجاد حجم برای ذخیره داده‌ها
# Create a volume for data storage
docker volume create hetznerdock_data

# Run the container
docker run -d \
  --restart always \
  --name hetznerdock \
  -p 8001:8000 \
  -v hetznerdock_data:/app/data \
  -e SECRET_KEY=your_custom_secret_key \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=changeme \
  mahdigraph/hetznerdock:latest

# Access at http://localhost:8001 🌐
```

### 🔑 اطلاعات ورود پیش‌فرض

* **نام کاربری**: `admin`
* **رمز عبور**: `changeme`

**مهم**: 🔄 لطفاً پس از ورود، رمز عبور پیش‌فرض را تغییر دهید.

## ⚙️ پیکربندی

| متغیر                         | توضیحات                                  | مقدار پیش‌فرض |
| ----------------------------- | ---------------------------------------- | ------------- |
| `SECRET_KEY`                  | کلید امنیتی توکن JWT (نه کلید API هتزنر) | `default_key` |
| `ADMIN_USERNAME`              | نام کاربری مدیر                          | `admin`       |
| `ADMIN_PASSWORD`              | رمز عبور مدیر                            | `changeme`    |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | مدت زمان جلسه ورود                       | `30`          |
| `LOG_MAX_ENTRIES`             | حداکثر تعداد لاگ در هر پروژه             | `1000`        |

> 💡 توجه: کلیدهای API هتزنر پس از ورود به برنامه اضافه می‌شوند.
