import UIKit

/// Shown when the website cannot be reached: "You're offline" and a Try again button.
final class OfflineView: UIView {
    let retryButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(named: "PageBackground")
        let brand = UIColor(named: "AccentColor") ?? .systemTeal

        let iconCircle = UIView()
        iconCircle.backgroundColor = brand.withAlphaComponent(0.12)
        iconCircle.layer.cornerRadius = 42
        let icon = UIImageView(image: UIImage(systemName: "wifi.slash",
                                              withConfiguration: UIImage.SymbolConfiguration(pointSize: 32, weight: .semibold)))
        icon.tintColor = brand
        icon.translatesAutoresizingMaskIntoConstraints = false
        iconCircle.addSubview(icon)

        let title = UILabel()
        title.text = localized("offline.title")
        title.font = UIFontMetrics(forTextStyle: .title2).scaledFont(for: .systemFont(ofSize: 22, weight: .bold))
        title.adjustsFontForContentSizeCategory = true
        title.textColor = .label
        title.textAlignment = .center
        title.numberOfLines = 0
        title.accessibilityTraits = .header

        let body = UILabel()
        body.text = localized("offline.body")
        body.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: 15))
        body.adjustsFontForContentSizeCategory = true
        body.textColor = .secondaryLabel
        body.textAlignment = .center
        body.numberOfLines = 0

        var button = UIButton.Configuration.filled()
        button.title = localized("retry")
        button.baseBackgroundColor = brand
        button.baseForegroundColor = .white
        button.cornerStyle = .capsule
        button.contentInsets = NSDirectionalEdgeInsets(top: 15, leading: 28, bottom: 15, trailing: 28)
        retryButton.configuration = button

        let stack = UIStackView(arrangedSubviews: [iconCircle, title, body, retryButton])
        stack.axis = .vertical
        stack.alignment = .center
        stack.setCustomSpacing(22, after: iconCircle)
        stack.setCustomSpacing(8, after: title)
        stack.setCustomSpacing(26, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        let safe = safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            iconCircle.widthAnchor.constraint(equalToConstant: 84),
            iconCircle.heightAnchor.constraint(equalToConstant: 84),
            icon.centerXAnchor.constraint(equalTo: iconCircle.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: iconCircle.centerYAnchor),
            body.widthAnchor.constraint(lessThanOrEqualToConstant: 340),
            stack.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: safe.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: safe.trailingAnchor, constant: -32),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("OfflineView is built in code")
    }
}
