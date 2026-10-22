package expo.modules.documentshare

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Android Sharesheet for one PDF from cache/shared-documents/.
 *
 * ACTION_SEND carries a FileProvider content:// URI in EXTRA_STREAM and ClipData with
 * FLAG_GRANT_READ_URI_PERMISSION; Intent.createChooser hands that grant only to the app the
 * user picks. Unlike expo-sharing, no app is granted access up front. The caption rides in
 * EXTRA_TEXT. Nothing is sent automatically.
 */
class DocumentShareModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SacDocumentShare")

    AsyncFunction("sharePdfAsync") { fileUri: String, title: String?, message: String? ->
      val file = shareableFile(fileUri)
      val contentUri = FileProvider.getUriForFile(context, context.packageName + AUTHORITY_SUFFIX, file)
      val send = Intent(Intent.ACTION_SEND).apply {
        setTypeAndNormalize("application/pdf")
        putExtra(Intent.EXTRA_STREAM, contentUri)
        if (!title.isNullOrBlank()) putExtra(Intent.EXTRA_SUBJECT, title)
        if (!message.isNullOrBlank()) putExtra(Intent.EXTRA_TEXT, message)
        clipData = ClipData.newRawUri(file.name, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      appContext.throwingActivity.startActivity(Intent.createChooser(send, title))
    }

    /** Android 8+: whether the user has allowed SAC-POS to install apps (its own updates). */
    Function("canInstallPackages") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    /** Opens Settings → "Install unknown apps" for SAC-POS. */
    Function("openInstallSettings") {
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
      appContext.throwingActivity.startActivity(intent)
    }

    /**
     * Android's package installer for an update APK in cache/app-updates/. The user confirms the
     * install; Android itself refuses an APK not signed with this app's key or not newer.
     */
    AsyncFunction("installApkAsync") { fileUri: String ->
      val file = updateFile(fileUri)
      val contentUri = FileProvider.getUriForFile(context, context.packageName + AUTHORITY_SUFFIX, file)
      val install = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      appContext.throwingActivity.startActivity(install)
    }
  }

  /** Only an .apk directly inside cache/app-updates/. */
  private fun updateFile(fileUri: String): File {
    val path = Uri.parse(fileUri).path ?: throw NotShareableException()
    val root = File(context.cacheDir, UPDATE_DIR).canonicalFile
    val file = File(path).canonicalFile
    if (file.parentFile?.path != root.path || !file.isFile || !file.name.endsWith(".apk")) {
      throw NotShareableException()
    }
    return file
  }

  /** Only a .pdf directly inside cache/shared-documents/; anything else (other paths, ../) is refused. */
  private fun shareableFile(fileUri: String): File {
    val path = Uri.parse(fileUri).path ?: throw NotShareableException()
    val root = File(context.cacheDir, SHARE_DIR).canonicalFile
    val file = File(path).canonicalFile
    if (file.parentFile?.path != root.path || !file.isFile || !file.name.endsWith(".pdf")) {
      throw NotShareableException()
    }
    return file
  }

  companion object {
    private const val SHARE_DIR = "shared-documents"
    private const val UPDATE_DIR = "app-updates"
    private const val AUTHORITY_SUFFIX = ".SacDocumentShareProvider"
  }
}

internal class NotShareableException :
  CodedException("Only documents prepared for sharing can be shared")
